import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError } from "@/lib/api/errors";
import { createLockRunner } from "@/lib/auth/session";
import type { OutboxEntry } from "@/lib/db";
import { strings } from "@/lib/strings";
import { MAX_BATCH, RETRY_DELAYS_MS, SyncEngine, type SyncTransport } from "./sync";

type Body = OutboxEntry["body"];

function entry(n: number, overrides: Partial<OutboxEntry> = {}): OutboxEntry {
  const id = `d-${String(n).padStart(4, "0")}`;
  const eventId = overrides.eventId ?? "e-1";
  return {
    id,
    userId: "u-1",
    orgId: "o-1",
    eventId,
    body: { id, eventId, donorName: `Donor ${n}`, amountKobo: "100000", paymentMode: "CASH" },
    who: "General",
    eventName: "Day",
    status: "pending",
    attempts: 0,
    createdAt: n,
    ...overrides,
  };
}

function fakeStore(rows: OutboxEntry[]) {
  const map = new Map(rows.map((r) => [r.id, { ...r }]));
  return {
    map,
    pending: async (userId: string, limit: number) =>
      [...map.values()]
        .filter((r) => r.userId === userId && r.status === "pending")
        .sort((a, b) => a.createdAt - b.createdAt)
        .slice(0, limit),
    get: async (id: string) => map.get(id),
    remove: async (ids: readonly string[]) => {
      for (const id of ids) map.delete(id);
    },
    markAttention: async (ids: readonly string[], problem: string) => {
      for (const id of ids) {
        const row = map.get(id);
        if (row) Object.assign(row, { status: "attention", problem });
      }
    },
    countAttempt: async (ids: readonly string[]) => {
      for (const id of ids) {
        const row = map.get(id);
        if (row) row.attempts += 1;
      }
    },
  };
}

/** By default every batch succeeds: all ids created. */
function fakeTransport(overrides: Partial<SyncTransport> = {}) {
  const batches: Body[][] = [];
  const singles: Body[] = [];
  const deleted: string[] = [];
  const transport: SyncTransport = {
    batch: async (bodies) => {
      batches.push(bodies);
      return { created: bodies.map((b) => b.id), duplicates: [] };
    },
    one: async (body) => {
      singles.push(body);
    },
    deleteDonation: async (id) => {
      deleted.push(id);
    },
    ready: async () => true,
    ...overrides,
  };
  return { transport, batches, singles, deleted };
}

function engineWith(rows: OutboxEntry[], overrides: Partial<SyncTransport> = {}, online = true) {
  const store = fakeStore(rows);
  const t = fakeTransport(overrides);
  const state = { online };
  const engine = new SyncEngine({
    store,
    transport: t.transport,
    lock: createLockRunner(),
    isOnline: () => state.online,
  });
  return { engine, store, state, ...t };
}

const closed = () => new ApiError(409, { message: "This event is closed" });
const network = () => new ApiError(0, null, "network");

describe("SyncEngine", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("sends pending entries oldest first, one batch per event, and removes them", async () => {
    const { engine, store, batches } = engineWith([
      entry(3),
      entry(1),
      entry(2, { eventId: "e-2" }),
      entry(4, { userId: "someone-else" }),
    ]);
    const sent = vi.fn();
    engine.onSent(sent);
    await engine.sync("u-1");

    expect(batches.map((b) => b.map((d) => d.id))).toEqual([["d-0001", "d-0003"], ["d-0002"]]);
    expect([...store.map.keys()]).toEqual(["d-0004"]); // another account's entry stays
    expect(engine.getSnapshot()).toMatchObject({ phase: "idle", lastError: null });
    expect(engine.getSnapshot().lastSentAt).not.toBeNull();
    expect([...(sent.mock.calls[0]![0] as Map<string, unknown>).keys()]).toEqual(["e-1", "e-2"]);
  });

  it("treats duplicates (already on the server) as done", async () => {
    const { engine, store } = engineWith([entry(1), entry(2)], {
      batch: async () => ({ created: ["d-0001"], duplicates: ["d-0002"] }),
    });
    await engine.sync("u-1");
    expect(store.map.size).toBe(0);
  });

  it("sends in batches of at most 500", async () => {
    const rows = Array.from({ length: MAX_BATCH + 20 }, (_, i) => entry(i + 1));
    const { engine, store, batches } = engineWith(rows);
    await engine.sync("u-1");
    expect(batches.map((b) => b.length)).toEqual([MAX_BATCH, 20]);
    expect(store.map.size).toBe(0);
  });

  it("does nothing offline, and keeps everything", async () => {
    const { engine, store, batches } = engineWith([entry(1)], {}, false);
    await engine.sync("u-1");
    expect(batches).toEqual([]);
    expect(store.map.size).toBe(1);
    expect(engine.getSnapshot().phase).toBe("offline");
  });

  it("keeps entries on a connection error and retries later", async () => {
    let fail = true;
    const { engine, store } = engineWith([entry(1)], {
      batch: async (bodies) => {
        if (fail) throw network();
        return { created: bodies.map((b) => b.id), duplicates: [] };
      },
    });
    await engine.sync("u-1");
    expect(store.map.get("d-0001")).toMatchObject({ status: "pending", attempts: 1 });
    expect(engine.getSnapshot()).toMatchObject({
      phase: "waiting",
      lastError: strings.errors.network,
    });
    expect(engine.getSnapshot().nextRetryAt).not.toBeNull();

    fail = false;
    await vi.advanceTimersByTimeAsync(RETRY_DELAYS_MS[0]!);
    expect(store.map.size).toBe(0);
    expect(engine.getSnapshot().phase).toBe("idle");
  });

  it("waits when no access token can be had (server unreachable)", async () => {
    const { engine, store, batches } = engineWith([entry(1)], { ready: async () => false });
    await engine.sync("u-1");
    expect(batches).toEqual([]);
    expect(store.map.size).toBe(1);
    expect(engine.getSnapshot().phase).toBe("waiting");
  });

  it("marks a closed event's entries 'needs attention' and still sends the other events", async () => {
    const { engine, store } = engineWith([entry(1), entry(2, { eventId: "e-2" })], {
      batch: async (bodies) => {
        if (bodies[0]!.eventId === "e-1") throw closed();
        return { created: bodies.map((b) => b.id), duplicates: [] };
      },
    });
    await engine.sync("u-1");
    expect(store.map.get("d-0001")).toMatchObject({
      status: "attention",
      problem: strings.outbox.problemClosed,
    });
    expect(store.map.has("d-0002")).toBe(false);
    expect(engine.getSnapshot().phase).toBe("idle");
  });

  it("splits a refused batch (400) to find the bad entry, and sends the rest", async () => {
    const { engine, store, singles } = engineWith([entry(1), entry(2), entry(3)], {
      batch: async () => {
        throw new ApiError(400, {
          message: "Some donations name an awardee that is not in their event",
        });
      },
      one: async (body) => {
        singles.push(body);
        if (body.id === "d-0002") throw new ApiError(404, { message: "Awardee not found" });
      },
    });
    await engine.sync("u-1");
    expect(singles.map((b) => b.id)).toEqual(["d-0001", "d-0002", "d-0003"]);
    expect([...store.map.keys()]).toEqual(["d-0002"]);
    expect(store.map.get("d-0002")).toMatchObject({
      status: "attention",
      problem: strings.outbox.problemNotFound,
    });
  });

  it("never loops on an id the server didn't answer for", async () => {
    const { engine, store, batches } = engineWith([entry(1), entry(2)], {
      batch: async (bodies) => {
        batches.push(bodies);
        return { created: ["d-0001"], duplicates: [] };
      },
    });
    await engine.sync("u-1");
    expect(batches).toHaveLength(1);
    expect(store.map.get("d-0002")).toMatchObject({ status: "attention" });
  });

  it("stops when the session has ended, keeping every entry", async () => {
    const ended = Object.assign(new Error("Session ended"), { name: "SessionEndedError" });
    const { engine, store } = engineWith([entry(1)], {
      ready: async () => {
        throw ended;
      },
    });
    await engine.sync("u-1");
    expect(store.map.get("d-0001")).toMatchObject({ status: "pending" });
    expect(engine.getSnapshot()).toMatchObject({ phase: "signedOut", nextRetryAt: null });
  });

  it("runs once more when asked during a run, to pick up entries saved meanwhile", async () => {
    let release: () => void = () => undefined;
    const gate = new Promise<void>((resolve) => (release = resolve));
    const { engine, store, batches } = engineWith([entry(1)], {
      batch: async (bodies) => {
        batches.push(bodies);
        if (batches.length === 1) await gate;
        return { created: bodies.map((b) => b.id), duplicates: [] };
      },
    });
    const first = engine.sync("u-1");
    await vi.advanceTimersByTimeAsync(0);
    store.map.set("d-0002", entry(2));
    void engine.sync("u-1");
    release();
    await first;
    await vi.advanceTimersByTimeAsync(0);
    expect(batches.map((b) => b.map((d) => d.id))).toEqual([["d-0001"], ["d-0002"]]);
    expect(store.map.size).toBe(0);
  });

  it("undoes an unsent entry on the phone only, and a sent one on the server", async () => {
    const { engine, store, deleted } = engineWith([entry(1)]);
    await expect(engine.undo("d-0001", "u-1")).resolves.toBe("local");
    expect(store.map.size).toBe(0);
    expect(deleted).toEqual([]);

    await expect(engine.undo("d-0009", "u-1")).resolves.toBe("server");
    expect(deleted).toEqual(["d-0009"]);
  });
});
