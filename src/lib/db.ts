import Dexie, { type Table } from "dexie";
import type { components } from "@/sdk";

/**
 * The only data Ovation keeps on the device:
 * - `session`: the refresh token and the minimum profile needed to start offline.
 * - `prefs`: non-sensitive preferences such as the last used organisation id.
 * - `drafts`: the donation being typed on the entry screen, one per event (M3).
 * - `outbox`: donations saved on this phone and not yet confirmed by the server (M4).
 * - `kits`: what the entry screen needs to work offline for one event: its name, whether it
 *   is closed, your role and the awardee list with their last known totals (M4).
 * Nothing else from the API is stored. The service worker never caches API responses.
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

type CreateDonationBody = components["schemas"]["CreateDonationDto"];
type Role = components["schemas"]["Role"];

/**
 * A donation saved on this phone. `pending` ones are sent by the sync engine; `attention`
 * ones were refused (for example, the event was closed) and wait for the user. Rows are
 * deleted once the server confirms them. Never deleted because a session ended.
 */
export interface OutboxEntry {
  /** The donation's client id (also its id on the server). */
  id: string;
  userId: string;
  orgId: string;
  eventId: string;
  body: CreateDonationBody;
  /** Shown in lists without a lookup: "2. Lolo Ada" or "General (for all awardees)". */
  who: string;
  eventName: string;
  status: "pending" | "attention";
  attempts: number;
  /** For `attention`: why the server refused it, in plain words. */
  problem?: string;
  createdAt: number;
}

/** The offline entry screen's data for one event, refreshed whenever it loads online. */
export interface EntryKit {
  eventId: string;
  orgId: string;
  userId: string;
  role: Role;
  event: { name: string; date: string; closed: boolean };
  awardees: { id: string; number: number | null; name: string; totalKobo: string }[];
  generalKobo: string;
  savedAt: number;
}

export interface Pref {
  key: string;
  value: string;
}

class OvationDB extends Dexie {
  session!: Table<StoredSession, "current">;
  prefs!: Table<Pref, string>;
  drafts!: Table<DonationDraft, string>;
  outbox!: Table<OutboxEntry, string>;
  kits!: Table<EntryKit, string>;

  constructor() {
    super("ovation");
    this.version(1).stores({ session: "id", prefs: "key" });
    this.version(2).stores({ session: "id", prefs: "key", drafts: "eventId" });
    this.version(3).stores({
      session: "id",
      prefs: "key",
      drafts: "eventId",
      outbox: "id, userId, [userId+status], [userId+eventId], createdAt",
      kits: "eventId, userId",
    });
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

/** Removes the session, preferences and drafts. Unused; the outbox is never cleared in bulk. */
export async function clearLocalData(): Promise<void> {
  await db().transaction("rw", [db().session, db().prefs, db().drafts], async () => {
    await db().session.clear();
    await db().prefs.clear();
    await db().drafts.clear();
  });
}

/**
 * Drafts and entry kits hold names, so a deliberate sign-out removes them (shared phones).
 * The outbox is never cleared here: unsent donations are kept until the server has them.
 */
export async function clearDrafts(): Promise<void> {
  await db().transaction("rw", [db().drafts, db().kits], async () => {
    await db().drafts.clear();
    await db().kits.clear();
  });
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
