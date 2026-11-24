"use client";

import { useEffect, useRef } from "react";
import { strings } from "@/lib/strings";

export interface SummaryItem {
  /** id of the field to focus, or undefined for a message about the whole form. */
  fieldId?: string;
  message: string;
}

/**
 * Shown after a failed submit. Receives focus so screen reader users hear the problems,
 * and links to each field. `focusKey` changes on every failed submit to refocus.
 */
export function ErrorSummary({ items, focusKey }: { items: SummaryItem[]; focusKey: number }) {
  const ref = useRef<HTMLDivElement>(null);
  const focusedFor = useRef(0);
  const hasItems = items.length > 0;

  // Focus once per failed submit. The errors may render a frame after the submit, so wait
  // until the summary exists; later keystrokes that change the list never steal focus.
  useEffect(() => {
    if (!hasItems || focusKey === focusedFor.current) return;
    focusedFor.current = focusKey;
    ref.current?.focus();
  }, [focusKey, hasItems]);

  if (items.length === 0) return null;

  return (
    <div
      ref={ref}
      tabIndex={-1}
      role="alert"
      aria-labelledby="error-summary-title"
      className="ov-border rounded-lg border-2 border-danger bg-surface p-4"
    >
      <h2 id="error-summary-title" className="font-sans text-lg font-bold text-danger">
        {strings.errors.summaryTitle}
      </h2>
      <ul className="mt-2 flex flex-col gap-1">
        {items.map((item) => (
          <li key={`${item.fieldId ?? "form"}-${item.message}`}>
            {item.fieldId ? (
              <a
                href={`#${item.fieldId}`}
                className="inline-block py-1 font-semibold text-danger underline underline-offset-4"
                onClick={(event) => {
                  const field = document.getElementById(item.fieldId!);
                  if (!field) return;
                  event.preventDefault();
                  field.focus();
                  field.scrollIntoView?.({ block: "center" });
                }}
              >
                {item.message}
              </a>
            ) : (
              <span className="font-semibold text-danger">{item.message}</span>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}
