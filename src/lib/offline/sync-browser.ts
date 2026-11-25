import { api, call } from "@/lib/api/client";
import { createLockRunner } from "@/lib/auth/session";
import { getSession } from "@/lib/auth/session-browser";
import { countAttempt, getEntry, markAttention, pendingFor, removeEntries } from "./outbox";
import { SyncEngine } from "./sync";

/** A batch of 500 with its audit rows can take a while on a waking server. */
const BATCH_TIMEOUT_MS = 90_000;

let engine: SyncEngine | null = null;

/** The app's one sync engine, wired to IndexedDB and the API client. Browser only. */
export function getSyncEngine(): SyncEngine {
  engine ??= new SyncEngine({
    store: {
      pending: pendingFor,
      get: getEntry,
      remove: removeEntries,
      markAttention,
      countAttempt,
    },
    transport: {
      batch: (donations) =>
        call((signal) => api.POST("/api/donations/batch", { body: { donations }, signal }), {
          timeoutMs: BATCH_TIMEOUT_MS,
        }),
      one: async (body) => {
        await call((signal) => api.POST("/api/donations", { body, signal }));
      },
      deleteDonation: async (id) => {
        await call((signal) =>
          api.DELETE("/api/donations/{id}", { params: { path: { id } }, signal }),
        );
      },
      ready: async () => (await getSession().ensureAccessToken()) !== null,
    },
    lock: createLockRunner(),
    isOnline: () => navigator.onLine,
  });
  return engine;
}
