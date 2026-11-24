import Dexie, { type Table } from "dexie";

/**
 * The only data Ovation keeps on the device in M0 and M1:
 * - `session`: the refresh token and the minimum profile needed to start offline.
 * - `prefs`: non-sensitive preferences such as the last used organisation id.
 * API responses are never written here. The offline outbox arrives in M4 (docs/ROADMAP.md).
 */
export interface StoredSession {
  id: "current";
  refreshToken: string;
  /** When this refresh token was issued (ms). Used only to warn before it expires. */
  issuedAt: number;
  user: { id: string; name: string; email: string };
  /** When a refresh with this token was sent and got no answer yet (ms). Not indexed. */
  refreshSentAt?: number;
}

export interface Pref {
  key: string;
  value: string;
}

class OvationDB extends Dexie {
  session!: Table<StoredSession, "current">;
  prefs!: Table<Pref, string>;

  constructor() {
    super("ovation");
    this.version(1).stores({ session: "id", prefs: "key" });
  }
}

let instance: OvationDB | null = null;

export function db(): OvationDB {
  instance ??= new OvationDB();
  return instance;
}

export async function getPref(key: string): Promise<string | undefined> {
  return (await db().prefs.get(key))?.value;
}

export async function setPref(key: string, value: string): Promise<void> {
  await db().prefs.put({ key, value });
}

export async function deletePref(key: string): Promise<void> {
  await db().prefs.delete(key);
}

/** Removes everything Ovation stored on this device. */
export async function clearLocalData(): Promise<void> {
  await db().transaction("rw", db().session, db().prefs, async () => {
    await db().session.clear();
    await db().prefs.clear();
  });
}
