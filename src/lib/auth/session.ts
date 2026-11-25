/**
 * Session and token manager.
 *
 * - The access token (15 min) lives in memory only.
 * - The refresh token (7 days, single use, rotated on every refresh) lives in IndexedDB.
 *   Reusing a spent refresh token makes the backend end every session of the account, so:
 *   one refresh at a time across all tabs (Web Locks), re-read the stored token inside the
 *   lock, and persist the new token before anyone sees the new access token.
 * - A network failure during refresh keeps the stored token. Only a 401 from /auth/refresh
 *   ends the session. Being offline with an expired access token is normal.
 * - A refresh that got no answer may still have rotated the token on the server. The backend
 *   gives the same new token back if the old one is sent again within 2 minutes, and treats it
 *   as theft after that. So the send time is saved before sending, retries stop after
 *   REPLAY_SAFE_MS, and after that the user signs in again rather than risk every session.
 *
 * All I/O is injected so the logic can be tested with fake timers and fakes.
 */

export interface SessionUser {
  id: string;
  name: string;
  email: string;
}

export interface TokenPair {
  accessToken: string;
  refreshToken: string;
  user: SessionUser;
}

export interface StoredSessionRecord {
  refreshToken: string;
  issuedAt: number;
  user: SessionUser;
  /** When a refresh with this token was first sent and has had no answer since (ms). */
  refreshSentAt?: number;
}

export type RefreshOutcome =
  | { kind: "ok"; tokens: TokenPair }
  | { kind: "unauthorized" }
  /** `status` only when the server answered (429, 5xx). Without it, the outcome is unknown. */
  | { kind: "unavailable"; status?: number };

export interface SessionStore {
  get(): Promise<StoredSessionRecord | undefined>;
  put(record: StoredSessionRecord): Promise<void>;
  clear(): Promise<void>;
}

export interface SessionTransport {
  refresh(refreshToken: string): Promise<RefreshOutcome>;
  /** Best effort: failures are ignored. */
  logout(refreshToken: string): Promise<void>;
}

export type BroadcastMessage =
  { type: "tokens"; accessToken: string; user: SessionUser } | { type: "logout" };

export interface SessionChannel {
  post(message: BroadcastMessage): void;
  subscribe(listener: (message: BroadcastMessage) => void): () => void;
}

export type LockRunner = <T>(name: string, fn: () => Promise<T>) => Promise<T>;

export interface SessionEnvironment {
  isVisible(): boolean;
  isOnline(): boolean;
  /** Subscribe to visibilitychange and online events. */
  onWake(listener: () => void): () => void;
}

export interface SessionDeps {
  store: SessionStore;
  transport: SessionTransport;
  channel?: SessionChannel;
  lock?: LockRunner;
  environment?: SessionEnvironment;
  now?: () => number;
}

export type SessionStatus = "loading" | "anonymous" | "authenticated";

export interface SessionSnapshot {
  status: SessionStatus;
  user: SessionUser | null;
  /** Why the last session ended, for a message on the login page. */
  endedReason: "expired" | "logout" | null;
}

/** The session is over (401 from /auth/refresh, or nothing stored). */
export class SessionEndedError extends Error {
  constructor() {
    super("Session ended");
    this.name = "SessionEndedError";
  }
}

/** Refresh could not run right now (offline, server asleep, 5xx, 429). The session is kept. */
export class RefreshUnavailableError extends Error {
  constructor(public readonly status?: number) {
    super("Refresh unavailable");
    this.name = "RefreshUnavailableError";
  }
}

export const REFRESH_LOCK = "ovation-refresh";
/** Refresh this long before the access token expires. */
export const REFRESH_LEAD_MS = 60_000;
/** A token with less than this left is treated as expired when deciding to skip a refresh. */
const FRESH_MARGIN_MS = 30_000;
/**
 * How long after an unanswered refresh the same token may be sent again. The backend allows
 * 2 minutes from when it first used the token (never earlier than our send); the 20 seconds
 * spare cover the retry's own trip.
 */
export const REPLAY_SAFE_MS = 100_000;
/** Retry delays after a failed refresh (with 30 s timeouts, three retries fit the window). */
const RETRY_DELAYS_MS = [5_000, 15_000, 30_000, 60_000];
const UNAUTHORIZED_RECHECK_MS = 1_500;
export const REFRESH_TOKEN_TTL_MS = 7 * 24 * 60 * 60 * 1000;

/** Reads `exp` (ms) from a JWT for scheduling only. Never used for authorisation. */
export function tokenExpiry(jwt: string): number | null {
  const payload = jwt.split(".")[1];
  if (!payload) return null;
  try {
    const json = atob(payload.replace(/-/g, "+").replace(/_/g, "/"));
    const exp = (JSON.parse(json) as { exp?: unknown }).exp;
    return typeof exp === "number" ? exp * 1000 : null;
  } catch {
    return null;
  }
}

/** Falls back to an in-tab mutex when the Web Locks API is unavailable. */
export function createLockRunner(): LockRunner {
  const locks = typeof navigator !== "undefined" ? navigator.locks : undefined;
  if (locks)
    return <T>(name: string, fn: () => Promise<T>) => locks.request(name, fn) as Promise<T>;
  const tails = new Map<string, Promise<unknown>>();
  return (name, fn) => {
    const previous = tails.get(name) ?? Promise.resolve();
    const run = previous.catch(() => undefined).then(fn);
    tails.set(name, run);
    return run;
  };
}

export class SessionManager {
  private accessToken: string | null = null;
  private accessExpiresAt = 0;
  private snapshot: SessionSnapshot = { status: "loading", user: null, endedReason: null };
  private readonly listeners = new Set<() => void>();
  private inflight: Promise<string> | null = null;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private retryIndex = 0;
  /**
   * Bumped whenever the session ends. A refresh that started before the bump must not bring
   * the session back when its answer arrives (sign-out while a refresh is in flight).
   */
  private epoch = 0;
  private readonly cleanups: (() => void)[] = [];
  private readonly lock: LockRunner;
  private readonly now: () => number;

  constructor(private readonly deps: SessionDeps) {
    this.lock = deps.lock ?? createLockRunner();
    this.now = deps.now ?? Date.now;
    if (deps.channel) this.cleanups.push(deps.channel.subscribe((m) => this.onBroadcast(m)));
    if (deps.environment) this.cleanups.push(deps.environment.onWake(() => this.onWake()));
  }

  // ---- reading state -------------------------------------------------------------------

  getSnapshot = (): SessionSnapshot => this.snapshot;

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  /** The in-memory access token, or null. Never persisted. */
  getAccessToken = (): string | null => this.accessToken;

  hasFreshAccessToken(margin = FRESH_MARGIN_MS): boolean {
    return this.accessToken !== null && this.accessExpiresAt - this.now() > margin;
  }

  // ---- lifecycle -------------------------------------------------------------------------

  /**
   * Restores the session at app start. With a stored refresh token the user counts as signed
   * in immediately (so offline starts work), and a refresh runs in the background when online.
   */
  async restore(): Promise<void> {
    let stored: StoredSessionRecord | undefined;
    try {
      stored = await this.deps.store.get();
    } catch {
      stored = undefined;
    }
    if (!stored) {
      this.setSnapshot({ status: "anonymous", user: null, endedReason: null });
      return;
    }
    this.setSnapshot({ status: "authenticated", user: stored.user, endedReason: null });
    if (this.canRefreshNow()) {
      await this.refresh().catch(() => undefined);
    }
  }

  /** Stores a new token pair from login, register, password change or refresh. */
  async acceptTokens(tokens: TokenPair, broadcast = true): Promise<void> {
    // Persist first: if the tab dies right after, the next start must have the live token.
    await this.deps.store.put({
      refreshToken: tokens.refreshToken,
      issuedAt: this.now(),
      user: tokens.user,
    });
    this.setAccessToken(tokens.accessToken);
    this.setSnapshot({ status: "authenticated", user: tokens.user, endedReason: null });
    if (broadcast) {
      this.deps.channel?.post({
        type: "tokens",
        accessToken: tokens.accessToken,
        user: tokens.user,
      });
    }
  }

  /**
   * Refreshes the access token. Single flight within the tab, and serialised across tabs by a
   * Web Lock. Resolves with a fresh access token.
   */
  refresh(): Promise<string> {
    if (this.inflight) return this.inflight;
    const tokenBefore = this.accessToken;
    this.inflight = this.lock(REFRESH_LOCK, () => this.refreshLocked(tokenBefore)).finally(() => {
      this.inflight = null;
    });
    return this.inflight;
  }

  private async refreshLocked(tokenBefore: string | null): Promise<string> {
    // Another tab may have refreshed while we waited for the lock and told us the result.
    if (this.accessToken !== tokenBefore && this.hasFreshAccessToken()) return this.accessToken!;

    // Always re-read: another tab may have rotated the token since we last looked.
    const stored = await this.deps.store.get();
    if (!stored) {
      this.endLocally("expired", false);
      throw new SessionEndedError();
    }

    // Offline requests fail before they leave the device: don't send, and don't start the clock.
    if (this.deps.environment && !this.deps.environment.isOnline()) {
      throw new RefreshUnavailableError();
    }

    if (stored.refreshSentAt !== undefined && this.now() - stored.refreshSentAt > REPLAY_SAFE_MS) {
      // An earlier refresh got no answer and the replay window has passed. The token may be
      // spent, and sending it now could end every session of the account. Logging out with it
      // is safe, and also revokes the replacement we never received.
      await this.deps.transport.logout(stored.refreshToken).catch(() => undefined);
      await this.endLocally("expired", true);
      throw new SessionEndedError();
    }
    const firstSend = stored.refreshSentAt === undefined;
    if (firstSend) await this.deps.store.put({ ...stored, refreshSentAt: this.now() });

    const epoch = this.epoch;
    let outcome: RefreshOutcome;
    try {
      outcome = await this.deps.transport.refresh(stored.refreshToken);
    } catch {
      outcome = { kind: "unavailable" };
    }

    if (this.epoch !== epoch) {
      // Signed out while this refresh was on its way. Don't store its tokens; end the new
      // session on the server too (best effort; logging out with the old token already
      // revokes an unseen replacement).
      if (outcome.kind === "ok") {
        await this.deps.transport.logout(outcome.tokens.refreshToken).catch(() => undefined);
      }
      throw new SessionEndedError();
    }

    if (outcome.kind === "ok") {
      this.retryIndex = 0;
      await this.acceptTokens(outcome.tokens);
      return outcome.tokens.accessToken;
    }

    if (outcome.kind === "unauthorized") {
      // The stored token was refused. If another tab replaced it meanwhile, that one is live.
      // Without Web Locks the other tab may still be saving it, so look twice.
      for (const wait of [0, UNAUTHORIZED_RECHECK_MS]) {
        if (wait) await new Promise((resolve) => setTimeout(resolve, wait));
        const current = await this.deps.store.get();
        if (current && current.refreshToken !== stored.refreshToken) {
          return this.refreshLocked(this.accessToken);
        }
      }
      await this.endLocally("expired", true);
      throw new SessionEndedError();
    }

    // The server answered (429, 5xx) without rotating, so this attempt doesn't count. An
    // earlier unanswered one still does, so only clear the mark this attempt set.
    if (outcome.status !== undefined && firstSend) {
      await this.deps.store.put(stored).catch(() => undefined);
    }
    this.scheduleRetry();
    throw new RefreshUnavailableError(outcome.status);
  }

  /**
   * Returns a usable access token: the current one if fresh, otherwise a refreshed one.
   * Returns null when offline or the server is unreachable (callers treat that as offline).
   */
  async ensureAccessToken(): Promise<string | null> {
    if (this.snapshot.status !== "authenticated") return null;
    if (this.hasFreshAccessToken(5_000)) return this.accessToken;
    try {
      return await this.refresh();
    } catch (error) {
      if (error instanceof RefreshUnavailableError) return null;
      throw error;
    }
  }

  /** Ends this session on the server (best effort) and clears everything local. */
  async logout(): Promise<void> {
    const stored = await this.deps.store.get().catch(() => undefined);
    if (stored) await this.deps.transport.logout(stored.refreshToken).catch(() => undefined);
    await this.endLocally("logout", true);
  }

  /** Clears local session state without calling the server (used after logout-all). */
  async endLocally(reason: "expired" | "logout", broadcast: boolean): Promise<void> {
    this.epoch += 1;
    this.clearTimer();
    this.accessToken = null;
    this.accessExpiresAt = 0;
    await this.deps.store.clear().catch(() => undefined);
    this.setSnapshot({ status: "anonymous", user: null, endedReason: reason });
    if (broadcast) this.deps.channel?.post({ type: "logout" });
  }

  /** When the stored refresh token will stop working, if it is never refreshed (ms). */
  async refreshTokenExpiresAt(): Promise<number | null> {
    const stored = await this.deps.store.get().catch(() => undefined);
    return stored ? stored.issuedAt + REFRESH_TOKEN_TTL_MS : null;
  }

  dispose(): void {
    this.clearTimer();
    for (const cleanup of this.cleanups.splice(0)) cleanup();
    this.listeners.clear();
  }

  // ---- internals -------------------------------------------------------------------------

  private setSnapshot(next: SessionSnapshot): void {
    const prev = this.snapshot;
    if (
      prev.status === next.status &&
      prev.user === next.user &&
      prev.endedReason === next.endedReason
    ) {
      return;
    }
    this.snapshot = next;
    for (const listener of this.listeners) listener();
  }

  private setAccessToken(token: string): void {
    this.accessToken = token;
    this.accessExpiresAt = tokenExpiry(token) ?? this.now() + 15 * 60_000;
    this.scheduleProactiveRefresh();
  }

  private canRefreshNow(): boolean {
    const env = this.deps.environment;
    return !env || (env.isVisible() && env.isOnline());
  }

  private clearTimer(): void {
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
  }

  private scheduleProactiveRefresh(): void {
    this.clearTimer();
    const delay = Math.max(0, this.accessExpiresAt - REFRESH_LEAD_MS - this.now());
    this.timer = setTimeout(() => {
      this.timer = null;
      // Hidden or offline: wait for onWake instead of refreshing in the background.
      if (this.canRefreshNow()) void this.refresh().catch(() => undefined);
    }, delay);
  }

  private scheduleRetry(): void {
    this.clearTimer();
    const delay = RETRY_DELAYS_MS[Math.min(this.retryIndex, RETRY_DELAYS_MS.length - 1)]!;
    this.retryIndex++;
    this.timer = setTimeout(() => {
      this.timer = null;
      if (this.canRefreshNow() && !this.hasFreshAccessToken()) {
        void this.refresh().catch(() => undefined);
      }
    }, delay);
  }

  private onWake(): void {
    if (this.snapshot.status !== "authenticated") return;
    if (!this.hasFreshAccessToken(REFRESH_LEAD_MS) && this.canRefreshNow()) {
      void this.refresh().catch(() => undefined);
    }
  }

  private onBroadcast(message: BroadcastMessage): void {
    if (message.type === "tokens") {
      // Another tab refreshed and already persisted the new refresh token.
      this.setAccessToken(message.accessToken);
      this.setSnapshot({ status: "authenticated", user: message.user, endedReason: null });
    } else {
      void this.endLocally("logout", false);
    }
  }
}
