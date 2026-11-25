import type { EventDto, EventSummary } from "@/lib/api/queries";
import type { Role } from "@/lib/auth/auth-provider";
import { db, type EntryKit } from "@/lib/db";

/**
 * What the entry screen shows, from the live API or, offline, from the kit saved the last
 * time it loaded online. Totals in a kit are as they were then.
 */
export interface EntryData {
  eventName: string;
  closed: boolean;
  role: Role;
  awardees: EntryKit["awardees"];
  generalKobo: string;
  /** When the kit was saved; null for live data. */
  savedAt: number | null;
}

export function kitFrom(
  ids: { orgId: string; userId: string },
  event: EventDto,
  summary: EventSummary,
  role: Role,
  now = Date.now(),
): EntryKit {
  return {
    eventId: event.id,
    orgId: ids.orgId,
    userId: ids.userId,
    role,
    event: { name: event.name, date: event.date, closed: event.closed },
    awardees: summary.awardees.map(({ id, number, name, totalKobo }) => ({
      id,
      number,
      name,
      totalKobo,
    })),
    generalKobo: summary.general.totalKobo,
    savedAt: now,
  };
}

export function entryDataFrom(kit: EntryKit, live: boolean): EntryData {
  return {
    eventName: kit.event.name,
    closed: kit.event.closed,
    role: kit.role,
    awardees: kit.awardees,
    generalKobo: kit.generalKobo,
    savedAt: live ? null : kit.savedAt,
  };
}

/** Never throws: the kit is a convenience for offline use. */
export async function saveKit(kit: EntryKit): Promise<void> {
  try {
    await db().kits.put(kit);
  } catch {
    // Storage full or unavailable: the screen still works online.
  }
}

/** The kit for this event and user, or null. */
export async function loadKit(eventId: string, userId: string): Promise<EntryKit | null> {
  try {
    const kit = await db().kits.get(eventId);
    return kit?.userId === userId ? kit : null;
  } catch {
    return null;
  }
}

/** Every kit of this user, newest first: the events they can record for offline. */
export async function kitsFor(userId: string): Promise<EntryKit[]> {
  try {
    const kits = await db().kits.where("userId").equals(userId).toArray();
    return kits.sort((a, b) => b.savedAt - a.savedAt);
  } catch {
    return [];
  }
}
