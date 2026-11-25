import type { components } from "@/sdk";
import { ApiError } from "@/lib/api/errors";
import type { LockRunner } from "@/lib/auth/session";
import type { OutboxEntry } from "@/lib/db";
import { strings } from "@/lib/strings";

/**
 * The sync engine: sends the outbox to the server.
 *
 * - One sync at a time across tabs (Web Lock `ovation-sync`), and within a tab.
 * - Oldest first, up to 500 per request (`POST /donations/batch`), one event per request so a
 *   closed event can't hold back the others. Created and duplicate ids are both done: the
 *   client id makes every send safe to repeat.
 * - Connection trouble, a sleeping server, 5xx and 429 stop the run and keep everything;
 *   a retry is scheduled. A refusal (closed event, lost access, a removed awardee) marks the
 *   entries "needs attention" for the user. Nothing is ever dropped silently.
 * - If the session has ended, it stops; entries wait for the same user to sign in again.
 *
 * All I/O is injected, so the logic is tested with fakes (sync.test.ts).
 */

type CreateDonationBody = components["schemas"]["CreateDonationDto"];

export const SYNC_LOCK = "ovation-sync";
/** The API's batch limit (BatchDonationsDto). */
export const MAX_BATCH = 500;
/** Waits before retrying after a failed run, growing to five minutes. */
export const RETRY_DELAYS_MS = [10_000, 30_000, 60_000, 120_000, 300_000];

export interface SyncStore {
  pending(userId: string, limit: number): Promise<OutboxEntry[]>;
  get(id: string): Promise<OutboxEntry | undefined>;
  remove(ids: readonly string[]): Promise<void>;
  markAttention(ids: readonly string[], problem: string): Promise<void>;
  countAttempt(ids: readonly string[]): Promise<void>;
}

export interface SyncTransport {
  batch(bodies: CreateDonationBody[]): Promise<{ created: string[]; duplicates: string[] }>;
  one(body: CreateDonationBody): Promise<void>;
  deleteDonation(id: string): Promise<void>;
  /** A usable access token exists (refreshing if needed). False when offline or unreachable. */
  ready(): Promise<boolean>;
}

export interface SyncDeps {
  store: SyncStore;
  transport: SyncTransport;
  lock: LockRunner;
  isOnline: () => boolean;
  now?: () => number;
}

export type SyncPhase = "idle" | "syncing" | "offline" | "waiting" | "signedOut";

export interface SyncState {
  phase: SyncPhase;
  lastSentAt: number | null;
  /** Why the last run stopped early (connection, server), in plain words. */
  lastError: string | null;
  nextRetryAt: number | null;
}

/** Which events got new donations in a run (to refresh their totals). */
export type SentEvents = Map<string, { orgId: string }>;

type Verdict =
  | { kind: "stop"; message: string }
  | { kind: "signedOut" }
  | { kind: "split" }
  | { kind: "refused"; problem: string };

/** What a failed send means for the entries in it. */
export function classify(error: unknown): Verdict {
  if (error instanceof Error && error.name === "SessionEndedError") return { kind: "signedOut" };
  if (!(error instanceof ApiError)) return { kind: "stop", message: strings.errors.unexpected };
  if (error.kind === "unauthorized") return { kind: "signedOut" };
  if (error.retriable || error.kind === "rateLimited") {
    return { kind: "stop", message: error.message };
  }
  if (error.status === 409 && /closed/i.test(error.serverMessage)) {
    return { kind: "refused", problem: strings.outbox.problemClosed };
  }
  if (error.status === 403) return { kind: "refused", problem: strings.outbox.problemForbidden };
  if (error.status === 404) return { kind: "refused", problem: strings.outbox.problemNotFound };
  if (error.status === 400) return { kind: "split" };
  return { kind: "refused", problem: error.serverMessage || error.message };
}

class StopSync extends Error {
  constructor(readonly verdict: Extract<Verdict, { kind: "stop" | "signedOut" }>) {
    super("stop");
  }
}

function byEvent(entries: OutboxEntry[]): OutboxEntry[][] {
  const groups = new Map<string, OutboxEntry[]>();
  for (const e of entries) groups.set(e.eventId, [...(groups.get(e.eventId) ?? []), e]);
  return [...groups.values()];
}

export class SyncEngine {
  private state: SyncState = {
    phase: "idle",
    lastSentAt: null,
    lastError: null,
    nextRetryAt: null,
  };
  private readonly listeners = new Set<() => void>();
  private readonly sentListeners = new Set<(sent: SentEvents) => void>();
  private running: Promise<void> | null = null;
  private again = false;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private retryIndex = 0;
  private userId: string | null = null;
  private readonly now: () => number;

  constructor(private readonly deps: SyncDeps) {
    this.now = deps.now ?? Date.now;
  }

  getSnapshot = (): SyncState => this.state;

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  /** Called after a run that sent something, with the events it touched. */
  onSent(listener: (sent: SentEvents) => void): () => void {
    this.sentListeners.add(listener);
    return () => this.sentListeners.delete(listener);
  }

  /** Sends this user's pending entries. Calls during a run queue one more run after it. */
  sync(userId: string): Promise<void> {
    this.userId = userId;
    if (this.running) {
      this.again = true;
      return this.running;
    }
    this.clearTimer();
    this.running = this.deps
      .lock(SYNC_LOCK, () => this.drain(userId))
      .finally(() => {
        this.running = null;
        if (this.again) {
          this.again = false;
          void this.sync(userId);
        }
      });
    return this.running;
  }

  /** Stops timers (sign-out, another user). Entries stay in the outbox. */
  stop(): void {
    this.clearTimer();
    this.userId = null;
    this.again = false;
    this.set({ phase: "idle", nextRetryAt: null, lastError: null });
  }

  /**
   * Undo a donation. Still on this phone: removed here, nothing reaches the server. Already
   * sent: deleted on the server (editors within 10 minutes; the API enforces that). Runs
   * inside the sync lock so it can't race a send of the same entry.
   */
  undo(id: string, userId: string): Promise<"local" | "server"> {
    return this.deps.lock(SYNC_LOCK, async () => {
      const entry = await this.deps.store.get(id);
      if (entry && entry.userId === userId) {
        await this.deps.store.remove([id]);
        return "local" as const;
      }
      await this.deps.transport.deleteDonation(id);
      return "server" as const;
    });
  }

  // ---- internals ---------------------------------------------------------------------------

  private async drain(userId: string): Promise<void> {
    if (!this.deps.isOnline()) {
      this.set({ phase: "offline", nextRetryAt: null });
      return;
    }
    const sent: SentEvents = new Map();
    this.set({ phase: "syncing" });
    try {
      if (!(await this.deps.transport.ready())) {
        throw new StopSync({ kind: "stop", message: strings.errors.network });
      }
      for (;;) {
        const entries = await this.deps.store.pending(userId, MAX_BATCH);
        if (entries.length === 0) break;
        for (const group of byEvent(entries)) await this.sendGroup(group, sent);
      }
      this.retryIndex = 0;
      this.set({ phase: "idle", lastError: null, nextRetryAt: null });
    } catch (error) {
      // StopSync carries the verdict. Anything else (the session ending while getting a token,
      // a storage error) stops the run too.
      const verdict: Extract<Verdict, { kind: "stop" | "signedOut" }> =
        error instanceof StopSync
          ? error.verdict
          : error instanceof Error && error.name === "SessionEndedError"
            ? { kind: "signedOut" }
            : { kind: "stop", message: strings.errors.unexpected };
      if (verdict.kind === "signedOut") {
        this.set({ phase: "signedOut", nextRetryAt: null });
      } else {
        this.set({
          phase: this.deps.isOnline() ? "waiting" : "offline",
          lastError: verdict.kind === "stop" ? verdict.message : null,
        });
        this.scheduleRetry(userId);
      }
    } finally {
      if (sent.size > 0) {
        this.set({ lastSentAt: this.now() });
        for (const listener of this.sentListeners) listener(sent);
      }
    }
  }

  private async sendGroup(group: OutboxEntry[], sent: SentEvents): Promise<void> {
    const ids = group.map((e) => e.id);
    await this.deps.store.countAttempt(ids);
    try {
      const result = await this.deps.transport.batch(group.map((e) => e.body));
      const done = new Set([...result.created, ...result.duplicates]);
      await this.deps.store.remove([...done]);
      // The server answers for every id it was sent. If one is missing, don't loop on it.
      const missing = ids.filter((id) => !done.has(id));
      if (missing.length > 0)
        await this.deps.store.markAttention(missing, strings.outbox.problemUnknown);
      if (result.created.length > 0) this.noteSent(group[0]!, sent);
    } catch (error) {
      const verdict = classify(error);
      if (verdict.kind === "stop" || verdict.kind === "signedOut") throw new StopSync(verdict);
      if (verdict.kind === "split" && group.length > 1) {
        // One bad entry fails the whole batch: send them one by one to find it.
        for (const entry of group) await this.sendOne(entry, sent);
        return;
      }
      await this.deps.store.markAttention(
        ids,
        verdict.kind === "refused" ? verdict.problem : (error as Error).message,
      );
    }
  }

  private async sendOne(entry: OutboxEntry, sent: SentEvents): Promise<void> {
    try {
      await this.deps.transport.one(entry.body);
      await this.deps.store.remove([entry.id]);
      this.noteSent(entry, sent);
    } catch (error) {
      const verdict = classify(error);
      if (verdict.kind === "stop" || verdict.kind === "signedOut") throw new StopSync(verdict);
      const problem =
        verdict.kind === "refused"
          ? verdict.problem
          : error instanceof ApiError
            ? error.serverMessages.join(" ") || error.message
            : strings.errors.unexpected;
      await this.deps.store.markAttention([entry.id], problem);
    }
  }

  private noteSent(entry: OutboxEntry, sent: SentEvents): void {
    sent.set(entry.eventId, { orgId: entry.orgId });
  }

  private scheduleRetry(userId: string): void {
    this.clearTimer();
    const delay = RETRY_DELAYS_MS[Math.min(this.retryIndex, RETRY_DELAYS_MS.length - 1)]!;
    this.retryIndex += 1;
    this.set({ nextRetryAt: this.now() + delay });
    this.timer = setTimeout(() => {
      this.timer = null;
      if (this.userId === userId) void this.sync(userId);
    }, delay);
  }

  private clearTimer(): void {
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
  }

  private set(patch: Partial<SyncState>): void {
    this.state = { ...this.state, ...patch };
    for (const listener of this.listeners) listener();
  }
}
