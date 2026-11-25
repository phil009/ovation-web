import type { OutboxEntry } from "@/lib/db";
import { strings } from "@/lib/strings";

/**
 * A CSV copy of unsent donations, for the sign-out warning and the "Waiting to send" page.
 * Opens in Excel with ₦ and Igbo letters intact (UTF-8 with a byte order mark).
 */

/** Kobo as exact naira: "5000050" -> "50000.50". Never through a float. */
export function koboToNaira(kobo: string): string {
  if (!/^\d+$/.test(kobo)) throw new Error("Kobo must be a digit string");
  const value = BigInt(kobo);
  const rest = value % 100n;
  return rest === 0n
    ? (value / 100n).toString()
    : `${value / 100n}.${rest.toString().padStart(2, "0")}`;
}

/**
 * One CSV cell. Text that a spreadsheet would run as a formula (=, +, -, @, tab, return at
 * the start) gets a leading apostrophe, so a donor name can never become a formula.
 */
export function csvCell(value: string): string {
  const safe = /^[=+\-@\t\r]/.test(value) ? `'${value}` : value;
  return /[",\r\n]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
}

const HEADER = [
  "Event",
  "For",
  "Donor",
  "Amount (naira)",
  "Payment",
  "Check later",
  "Note",
  "Saved at",
  "Status",
  "Problem",
  "Id",
];

export function unsentCsv(entries: readonly OutboxEntry[]): string {
  const rows = entries.map((e) => [
    e.eventName,
    e.who,
    e.body.donorName,
    koboToNaira(e.body.amountKobo),
    strings.paymentModes[e.body.paymentMode],
    e.body.needsReview ? "Yes" : "",
    e.body.note ?? "",
    new Date(e.createdAt).toISOString(),
    e.status === "attention" ? strings.outbox.attentionStatus : strings.outbox.pendingStatus,
    e.problem ?? "",
    e.id,
  ]);
  return `﻿${[HEADER, ...rows].map((row) => row.map(csvCell).join(",")).join("\r\n")}\r\n`;
}

/** Hands the file to the browser's downloads. Nothing leaves the phone. */
export function downloadCsv(entries: readonly OutboxEntry[]): void {
  const blob = new Blob([unsentCsv(entries)], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `${strings.outbox.csvFile}-${new Date().toISOString().slice(0, 10)}.csv`;
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}
