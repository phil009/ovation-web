import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  RefreshUnavailableError,
  SessionEndedError,
  SessionManager,
  createLockRunner,
  tokenExpiry,
  type BroadcastMessage,
  type RefreshOutcome,
  type SessionChannel,
  type SessionEnvironment,
  type StoredSessionRecord,
  type TokenPair,
} from "./session";

const NOW = Date.UTC(2026, 10, 24, 12, 0, 0);
const user = { id: "u1", name: "Ngozi Okafor", email: "ngozi@example.com" };

function jwt(expMs: number, n = 0): string {
  const payload = btoa(JSON.stringify({ sub: "u1", exp: Math.floor(expMs / 1000), n }))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
  return `header.${payload}.sig`;
}

let counter = 0;
function pair(): TokenPair {
  counter++;
  return {
    accessToken: jwt(Date.now() + 15 * 60_000, counter),
    refreshToken: `rt-${counter}`,
    user,
  };
}

function memoryStore(initial?: StoredSessionRecord, log?: string[]) {
  let value = initial;
  return {
    get: vi.fn(async () => value),
    put: vi.fn(async (record: StoredSessionRecord) => {
      await Promise.resolve();
      value = record;
      log?.push(`put ${record.refreshToken}`);
    }),
    clear: vi.fn(async () => {
      value = undefined;
    }),
    peek: () => value,
  };
}

/** Rotates like the backend: only the latest refresh token works. */
function fakeServer(start: string) {
  let live = start;
  const used: string[] = [];
  const refresh = vi.fn(async (token: string): Promise<RefreshOutcome> => {
    used.push(token);
    await Promise.resolve();
    if (token !== live) return { kind: "unauthorized" };
    const next = pair();
    live = next.refreshToken;
    return { kind: "ok", tokens: next };
  });
  return { refresh, logout: vi.fn(async () => undefined), used };
}

function linkedChannels(): [SessionChannel, SessionChannel] {
  const listeners: [Set<(m: BroadcastMessage) => void>, Set<(m: BroadcastMessage) => void>] = [
    new Set(),
    new Set(),
  ];
  const make = (self: 0 | 1): SessionChannel => ({
    post: (m) => queueMicrotask(() => listeners[self === 0 ? 1 : 0].forEach((l) => l(m))),
    subscribe: (l) => {
      listeners[self].add(l);
      return () => listeners[self].delete(l);
    },
  });
  return [make(0), make(1)];
}

function controllableEnvironment() {
  const state = { visible: true, online: true };
  const wakeListeners = new Set<() => void>();
  const environment: SessionEnvironment = {
    isVisible: () => state.visible,
    isOnline: () => state.online,
    onWake: (l) => {
      wakeListeners.add(l);
      return () => wakeListeners.delete(l);
    },
  };
  return { state, environment, wake: () => wakeListeners.forEach((l) => l()) };
}

const stored = (token = "rt-0"): StoredSessionRecord => ({
  refreshToken: token,
  issuedAt: NOW,
  user,
});

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout", "Date"] });
  vi.setSystemTime(NOW);
});

afterEach(() => {
  vi.useRealTimers();
});

describe("tokenExpiry", () => {
  it("reads exp in milliseconds", () => {
    expect(tokenExpiry(jwt(NOW + 60_000))).toBe(NOW + 60_000);
  });
  it("returns null for garbage", () => {
    expect(tokenExpiry("nope")).toBeNull();
    expect(tokenExpiry("a.!!!.c")).toBeNull();
  });
});

describe("SessionManager.refresh", () => {
  it("runs a single refresh for concurrent callers", async () => {
    const server = fakeServer("rt-0");
    const session = new SessionManager({ store: memoryStore(stored()), transport: server });

    const results = await Promise.all([session.refresh(), session.refresh(), session.refresh()]);

    expect(server.refresh).toHaveBeenCalledTimes(1);
    expect(new Set(results).size).toBe(1);
    expect(session.getAccessToken()).toBe(results[0]);
  });

  it("persists the new refresh token before any caller resolves", async () => {
    const log: string[] = [];
    const store = memoryStore(stored(), log);
    const server = fakeServer("rt-0");
    const session = new SessionManager({ store, transport: server });

    await session.refresh().then(() => log.push("resolved"));

    // First the send time is marked on the old token, then the new token replaces it.
    expect(log).toEqual(["put rt-0", `put ${store.peek()!.refreshToken}`, "resolved"]);
    expect(store.peek()!.refreshToken).not.toBe("rt-0");
    expect(store.peek()!.refreshSentAt).toBeUndefined();
  });

  it("ends the session on a 401 from /auth/refresh", async () => {
    const store = memoryStore(stored("spent"));
    const server = fakeServer("rt-0");
    const session = new SessionManager({ store, transport: server });
    const restoring = session.restore();
    await vi.advanceTimersByTimeAsync(2_000);
    await restoring;

    const refreshing = expect(session.refresh()).rejects.toBeInstanceOf(SessionEndedError);
    await vi.advanceTimersByTimeAsync(2_000);
    await refreshing;
    expect(session.getSnapshot()).toMatchObject({ status: "anonymous", endedReason: "expired" });
    expect(store.peek()).toBeUndefined();
    expect(session.getAccessToken()).toBeNull();
  });

  it("keeps the stored token on a network error and retries later", async () => {
    const store = memoryStore(stored());
    const transport = {
      refresh: vi
        .fn<(t: string) => Promise<RefreshOutcome>>()
        .mockRejectedValueOnce(new TypeError("Failed to fetch"))
        .mockResolvedValueOnce({ kind: "ok", tokens: pair() }),
      logout: vi.fn(),
    };
    const session = new SessionManager({ store, transport });

    await expect(session.refresh()).rejects.toBeInstanceOf(RefreshUnavailableError);
    expect(store.peek()!.refreshToken).toBe("rt-0");
    expect(session.getSnapshot().status).not.toBe("anonymous");

    await vi.advanceTimersByTimeAsync(5_000);
    expect(transport.refresh).toHaveBeenCalledTimes(2);
    expect(transport.refresh).toHaveBeenLastCalledWith("rt-0");
    expect(session.hasFreshAccessToken()).toBe(true);
  });

  it("treats a sleeping server (5xx) as unavailable, not as logged out", async () => {
    const store = memoryStore(stored());
    const transport = {
      refresh: vi.fn(async (): Promise<RefreshOutcome> => ({ kind: "unavailable", status: 503 })),
      logout: vi.fn(),
    };
    const session = new SessionManager({ store, transport });
    await session.restore();

    expect(session.getSnapshot().status).toBe("authenticated");
    expect(store.peek()).toBeDefined();
  });
});

describe("unanswered refresh (backend replay window)", () => {
  it("marks the send time, retries with the same token, and clears the mark on success", async () => {
    const store = memoryStore(stored());
    const same = pair();
    const transport = {
      refresh: vi
        .fn<(t: string) => Promise<RefreshOutcome>>()
        .mockRejectedValueOnce(new TypeError("Failed to fetch"))
        .mockResolvedValueOnce({ kind: "ok", tokens: same }),
      logout: vi.fn(),
    };
    const session = new SessionManager({ store, transport });

    await expect(session.refresh()).rejects.toBeInstanceOf(RefreshUnavailableError);
    expect(store.peek()).toMatchObject({ refreshToken: "rt-0", refreshSentAt: NOW });

    await vi.advanceTimersByTimeAsync(5_000);
    expect(transport.refresh).toHaveBeenLastCalledWith("rt-0");
    expect(store.peek()).toEqual({ refreshToken: same.refreshToken, issuedAt: NOW + 5_000, user });
  });

  it("only sends the token inside the window, then signs out safely instead", async () => {
    const store = memoryStore(stored());
    const sentAt: number[] = [];
    const transport = {
      // Every attempt times out after 30 seconds: the server may or may not have rotated.
      refresh: vi.fn(async (): Promise<RefreshOutcome> => {
        sentAt.push(Date.now());
        await new Promise((resolve) => setTimeout(resolve, 30_000));
        throw new DOMException("timed out", "TimeoutError");
      }),
      logout: vi.fn(async () => undefined),
    };
    const session = new SessionManager({ store, transport });
    const restoring = session.restore();
    await vi.advanceTimersByTimeAsync(1_000);
    expect(session.getSnapshot().status).toBe("authenticated");

    await vi.advanceTimersByTimeAsync(10 * 60_000);
    await restoring;

    expect(sentAt.length).toBeGreaterThanOrEqual(3);
    for (const time of sentAt) expect(time - NOW).toBeLessThanOrEqual(100_000);
    expect(transport.logout).toHaveBeenCalledWith("rt-0");
    expect(session.getSnapshot()).toMatchObject({ status: "anonymous", endedReason: "expired" });
    expect(store.peek()).toBeUndefined();
  });

  it("remembers an unanswered refresh across reloads", async () => {
    const store = memoryStore({ ...stored(), refreshSentAt: NOW - 3 * 60_000 });
    const server = fakeServer("rt-0");
    const session = new SessionManager({ store, transport: server });

    await session.restore();

    expect(server.refresh).not.toHaveBeenCalled();
    expect(server.logout).toHaveBeenCalledWith("rt-0");
    expect(session.getSnapshot().status).toBe("anonymous");
  });

  it("still retries a mark that is inside the window after a reload", async () => {
    const store = memoryStore({ ...stored(), refreshSentAt: NOW - 60_000 });
    const server = fakeServer("rt-0");
    const session = new SessionManager({ store, transport: server });

    await session.restore();

    expect(server.refresh).toHaveBeenCalledWith("rt-0");
    expect(session.hasFreshAccessToken()).toBe(true);
    expect(store.peek()!.refreshSentAt).toBeUndefined();
  });

  it("clears the mark when the server answers without rotating (429, 5xx)", async () => {
    const store = memoryStore(stored());
    const transport = {
      refresh: vi.fn(async (): Promise<RefreshOutcome> => ({ kind: "unavailable", status: 503 })),
      logout: vi.fn(),
    };
    const session = new SessionManager({ store, transport });

    await expect(session.refresh()).rejects.toBeInstanceOf(RefreshUnavailableError);
    expect(store.peek()).toEqual(stored());
  });

  it("keeps an earlier mark when a later attempt gets an answer", async () => {
    const store = memoryStore({ ...stored(), refreshSentAt: NOW - 10_000 });
    const transport = {
      refresh: vi.fn(async (): Promise<RefreshOutcome> => ({ kind: "unavailable", status: 503 })),
      logout: vi.fn(),
    };
    const session = new SessionManager({ store, transport });

    await expect(session.refresh()).rejects.toBeInstanceOf(RefreshUnavailableError);
    expect(store.peek()!.refreshSentAt).toBe(NOW - 10_000);
  });

  it("does not send while the browser is offline", async () => {
    const store = memoryStore(stored());
    const server = fakeServer("rt-0");
    const { state, environment } = controllableEnvironment();
    state.online = false;
    const session = new SessionManager({ store, transport: server, environment });

    await expect(session.refresh()).rejects.toBeInstanceOf(RefreshUnavailableError);
    expect(server.refresh).not.toHaveBeenCalled();
    expect(store.peek()!.refreshSentAt).toBeUndefined();
  });
});

describe("across tabs", () => {
  function twoTabs() {
    const store = memoryStore(stored());
    const server = fakeServer("rt-0");
    const lock = createLockRunner(); // one lock shared by both "tabs"
    const [a, b] = linkedChannels();
    const tabA = new SessionManager({ store, transport: server, lock, channel: a });
    const tabB = new SessionManager({ store, transport: server, lock, channel: b });
    return { store, server, tabA, tabB };
  }

  it("never sends the same refresh token twice when both tabs refresh at once", async () => {
    const { server, tabA, tabB } = twoTabs();

    await Promise.all([tabA.refresh(), tabB.refresh()]);

    expect(new Set(server.used).size).toBe(server.used.length);
    expect(server.refresh.mock.results.length).toBeGreaterThan(0);
    for (const r of server.refresh.mock.results) {
      await expect(r.value).resolves.toMatchObject({ kind: "ok" });
    }
    expect(tabA.hasFreshAccessToken()).toBe(true);
    expect(tabB.hasFreshAccessToken()).toBe(true);
  });

  it("skips the refresh when another tab already delivered a fresh token", async () => {
    const { server, tabA, tabB } = twoTabs();

    await tabA.refresh();
    await vi.advanceTimersByTimeAsync(0); // deliver the broadcast
    const before = server.refresh.mock.calls.length;
    expect(tabB.hasFreshAccessToken()).toBe(true);

    await tabB.ensureAccessToken();
    expect(server.refresh.mock.calls.length).toBe(before);
  });

  it("re-reads the stored token inside the lock (no broadcast received)", async () => {
    const store = memoryStore(stored());
    const server = fakeServer("rt-0");
    const lock = createLockRunner();
    const tabA = new SessionManager({ store, transport: server, lock });
    const tabB = new SessionManager({ store, transport: server, lock }); // no channel
    await tabA.refresh();
    const rotated = store.peek()!.refreshToken;

    await tabB.refresh();

    expect(server.used).toEqual(["rt-0", rotated]);
    expect(tabB.hasFreshAccessToken()).toBe(true);
  });

  it("recovers when its token was rotated by another tab between read and refresh", async () => {
    const store = memoryStore(stored());
    const server = fakeServer("rt-0");
    // Each tab gets its own lock here, simulating a browser without Web Locks.
    const tabA = new SessionManager({ store, transport: server, lock: createLockRunner() });
    const tabB = new SessionManager({ store, transport: server, lock: createLockRunner() });

    const settled = Promise.allSettled([tabA.refresh(), tabB.refresh()]);
    await vi.advanceTimersByTimeAsync(2_000);
    const results = await settled;

    // Without a shared lock one tab may be refused, but it retries with the rotated token
    // instead of ending the session.
    expect(results.every((r) => r.status === "fulfilled")).toBe(true);
    expect(store.peek()).toBeDefined();
  });

  it("shares logout with the other tab", async () => {
    const { tabA, tabB } = twoTabs();
    await tabA.refresh();
    await vi.advanceTimersByTimeAsync(0);

    await tabA.logout();
    await vi.advanceTimersByTimeAsync(0);

    expect(tabB.getSnapshot().status).toBe("anonymous");
    expect(tabB.getAccessToken()).toBeNull();
  });
});

describe("proactive refresh", () => {
  it("refreshes about a minute before expiry while visible and online", async () => {
    const server = fakeServer("rt-0");
    const { environment } = controllableEnvironment();
    const session = new SessionManager({
      store: memoryStore(stored()),
      transport: server,
      environment,
    });
    await session.restore();
    expect(server.refresh).toHaveBeenCalledTimes(1);

    await vi.advanceTimersByTimeAsync(13 * 60_000);
    expect(server.refresh).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(60_000 + 1);
    expect(server.refresh).toHaveBeenCalledTimes(2);
  });

  it("waits while hidden or offline, then refreshes on wake", async () => {
    const server = fakeServer("rt-0");
    const env = controllableEnvironment();
    const session = new SessionManager({
      store: memoryStore(stored()),
      transport: server,
      environment: env.environment,
    });
    await session.restore();

    env.state.online = false;
    await vi.advanceTimersByTimeAsync(20 * 60_000);
    expect(server.refresh).toHaveBeenCalledTimes(1);
    expect(session.getSnapshot().status).toBe("authenticated"); // offline never logs out

    env.state.online = true;
    env.wake();
    await vi.advanceTimersByTimeAsync(0);
    expect(server.refresh).toHaveBeenCalledTimes(2);
  });

  it("starts offline with a stored session as signed in", async () => {
    const server = fakeServer("rt-0");
    const env = controllableEnvironment();
    env.state.online = false;
    const session = new SessionManager({
      store: memoryStore(stored()),
      transport: server,
      environment: env.environment,
    });
    await session.restore();

    expect(session.getSnapshot()).toMatchObject({ status: "authenticated", user });
    expect(server.refresh).not.toHaveBeenCalled();
  });
});

describe("logout", () => {
  it("calls the server, clears local state, and ignores network failures", async () => {
    const store = memoryStore(stored());
    const transport = {
      refresh: vi.fn(),
      logout: vi.fn().mockRejectedValue(new TypeError("offline")),
    };
    const session = new SessionManager({ store, transport });
    await session.acceptTokens(pair());

    await session.logout();

    expect(transport.logout).toHaveBeenCalledOnce();
    expect(store.peek()).toBeUndefined();
    expect(session.getSnapshot()).toMatchObject({ status: "anonymous", endedReason: "logout" });
  });

  it("restores as anonymous when nothing is stored", async () => {
    const session = new SessionManager({ store: memoryStore(), transport: fakeServer("x") });
    await session.restore();
    expect(session.getSnapshot().status).toBe("anonymous");
  });
});
