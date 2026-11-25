import Dexie, { type Table } from "dexie";

/**
 * The only data Ovation keeps on the device:
 * - `session`: the refresh token and the minimum profile needed to start offline.
 * - `prefs`: non-sensitive preferences such as the last used organisation id.
 * - `drafts`: the donation being typed on the entry screen, one per event (M3).
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

/** A half-typed donation. Restored only for the same user, and cleared on sign-out. */
export interface DonationDraft {
  eventId: string;
  userId: string;
  /** The client id for this entry, reused on every retry so a retry never saves twice. */
  clientId: string;
  values: {
    awardeeId: string;
    donorName: string;
    amount: string;
    paymentMode: "CASH" | "TRANSFER" | "PLEDGE";
    needsReview: boolean;
    note: string;
  };
  updatedAt: number;
}

export interface Pref {
  key: string;
  value: string;
}

class OvationDB extends Dexie {
  session!: Table<StoredSession, "current">;
  prefs!: Table<Pref, string>;
  drafts!: Table<DonationDraft, string>;

  constructor() {
    super("ovation");
    this.version(1).stores({ session: "id", prefs: "key" });
    this.version(2).stores({ session: "id", prefs: "key", drafts: "eventId" });
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
  await db().transaction("rw", [db().session, db().prefs, db().drafts], async () => {
    await db().session.clear();
    await db().prefs.clear();
    await db().drafts.clear();
  });
}

/** Drafts hold donor names, so a deliberate sign-out removes them (shared phones). */
export async function clearDrafts(): Promise<void> {
  await db().drafts.clear();
}

/** The draft for an event, only if it belongs to this user. Never throws. */
export async function loadDraft(
  eventId: string,
  userId: string,
): Promise<DonationDraft | undefined> {
  try {
    const draft = await db().drafts.get(eventId);
    return draft?.userId === userId ? draft : undefined;
  } catch {
    return undefined;
  }
}

/** Saves the draft. Storage can fail (private mode, full disk): the form still works. */
export async function saveDraft(draft: Omit<DonationDraft, "updatedAt">): Promise<void> {
  try {
    await db().drafts.put({ ...draft, updatedAt: Date.now() });
  } catch {
    // Nothing to do: the draft is a convenience, the form keeps its values.
  }
}
