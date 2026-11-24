/**
 * Event dates are calendar days. The API takes "YYYY-MM-DD" and returns midnight UTC
 * ("2026-11-08T00:00:00.000Z"), so they are always read and shown in UTC. In local time, a
 * user west of Greenwich (the diaspora in the US) would see the day before.
 */

const DAY_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;

/** True for a real calendar day written as YYYY-MM-DD (what `<input type="date">` gives). */
export function isCalendarDay(value: string): boolean {
  const match = DAY_PATTERN.exec(value);
  if (!match) return false;
  const [, y, m, d] = match.map(Number) as [number, number, number, number];
  const date = new Date(Date.UTC(y, m - 1, d));
  return date.getUTCFullYear() === y && date.getUTCMonth() === m - 1 && date.getUTCDate() === d;
}

const longDate = new Intl.DateTimeFormat("en-GB", {
  weekday: "short",
  day: "numeric",
  month: "long",
  year: "numeric",
  timeZone: "UTC",
});

/** "2026-11-08T00:00:00.000Z" -> "Sun, 8 November 2026". */
export function formatEventDate(iso: string): string {
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? iso : longDate.format(date);
}

/** Today as YYYY-MM-DD in the user's own time zone (the default for a new event). */
export function todayLocal(now = new Date()): string {
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, "0");
  const d = String(now.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

const dateTime = new Intl.DateTimeFormat("en-GB", {
  day: "numeric",
  month: "short",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
});

/** A moment in the user's time zone, e.g. "24 Nov 2026, 16:05" (audit log, invites). */
export function formatDateTime(iso: string): string {
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? iso : dateTime.format(date);
}
