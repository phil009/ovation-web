import { formatNaira } from "./money";

/**
 * Audit entries carry the whole row before and after a change. The OpenAPI document types
 * them as `Record<string, unknown> | null`; still checked here, since a row is any shape.
 */

export interface FieldChange {
  field: string;
  before: string;
  after: string;
}

/** Bookkeeping columns that change on every write and tell a reader nothing. */
const IGNORED = new Set(["updatedAt", "version", "tokenHash", "passwordHash", "successorSealed"]);

const EMPTY = "—";

function asRecord(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

/** A value as plain text. Rendered as text by React, never as HTML. */
export function displayValue(field: string, value: unknown): string {
  if (value === null || value === undefined || value === "") return EMPTY;
  if (typeof value === "string") {
    return /Kobo$/.test(field) && /^-?\d+$/.test(value) ? formatNaira(value) : value;
  }
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  return JSON.stringify(value);
}

/** Fields that differ between before and after (all fields for a create or delete). */
export function changedFields(before: unknown, after: unknown): FieldChange[] {
  const a = asRecord(before) ?? {};
  const b = asRecord(after) ?? {};
  const fields = [...new Set([...Object.keys(a), ...Object.keys(b)])].filter(
    (field) => !IGNORED.has(field),
  );
  const changes: FieldChange[] = [];
  for (const field of fields) {
    const was = displayValue(field, a[field]);
    const now = displayValue(field, b[field]);
    if (was !== now) changes.push({ field, before: was, after: now });
  }
  return changes;
}
