import { db, type OutboxEntry } from "@/lib/db";

/**
 * The outbox: donations saved on this phone, waiting for the server. Writing here is the
 * "save"; sending is the sync engine's job (sync.ts). Every function scopes to one user, so
 * entries recorded by another account on a shared phone are never sent with the wrong token.
 */

export type NewOutboxEntry = Omit<OutboxEntry, "status" | "attempts" | "problem" | "createdAt">;

/** Saves a donation on this phone. Resolves once it is in IndexedDB. */
export async function enqueue(entry: NewOutboxEntry, now = Date.now()): Promise<OutboxEntry> {
  const row: OutboxEntry = { ...entry, status: "pending", attempts: 0, createdAt: now };
  await db().outbox.add(row);
  return row;
}

/** Oldest first, so donations reach the server in the order they were recorded. */
export async function pendingFor(userId: string, limit: number): Promise<OutboxEntry[]> {
  const rows = await db()
    .outbox.where("[userId+status]")
    .equals([userId, "pending"])
    .sortBy("createdAt");
  return rows.slice(0, limit);
}

/** Everything not yet on the server for this user (pending and needing attention). */
export async function unsentFor(userId: string): Promise<OutboxEntry[]> {
  return db().outbox.where("userId").equals(userId).sortBy("createdAt");
}

/** How many unsent entries belong to other accounts (shared phone). */
export async function otherAccountsCount(userId: string): Promise<number> {
  return db().outbox.where("userId").notEqual(userId).count();
}

export async function allUnsentCount(): Promise<number> {
  return db().outbox.count();
}

export async function getEntry(id: string): Promise<OutboxEntry | undefined> {
  return db().outbox.get(id);
}

/** The server has them (created now, or already before: duplicates). */
export async function removeEntries(ids: readonly string[]): Promise<void> {
  if (ids.length > 0) await db().outbox.bulkDelete([...ids]);
}

export async function markAttention(ids: readonly string[], problem: string): Promise<void> {
  await db()
    .outbox.where("id")
    .anyOf([...ids])
    .modify({ status: "attention", problem });
}

export async function countAttempt(ids: readonly string[]): Promise<void> {
  await db()
    .outbox.where("id")
    .anyOf([...ids])
    .modify((row) => {
      row.attempts += 1;
    });
}

/** "Try again": put refused entries back in the queue (after, say, an admin reopened the event). */
export async function retryEntries(userId: string, ids?: readonly string[]): Promise<void> {
  const rows = db().outbox.where("[userId+status]").equals([userId, "attention"]);
  await (ids ? rows.filter((r) => ids.includes(r.id)) : rows).modify((row) => {
    row.status = "pending";
    delete row.problem;
  });
}
