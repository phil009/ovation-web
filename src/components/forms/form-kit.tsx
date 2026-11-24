"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { FieldErrors, FieldValues, Path, UseFormReturn } from "react-hook-form";
import type { SummaryItem } from "@/components/ui/error-summary";
import { ApiError, isApiError } from "@/lib/api/errors";
import { strings } from "@/lib/strings";

/** Field name -> input id, for summary links. */
export type FieldIds<T> = Partial<Record<keyof T & string, string>>;

export function summaryItems<T extends FieldValues>(
  errors: FieldErrors<T>,
  ids: FieldIds<T>,
  formError: string | null,
): SummaryItem[] {
  const items: SummaryItem[] = [];
  if (formError) items.push({ message: formError });
  for (const [name, error] of Object.entries(errors)) {
    const message = (error as { message?: unknown } | undefined)?.message;
    if (typeof message === "string" && message) {
      items.push({ fieldId: ids[name as keyof T & string], message });
    }
  }
  return items;
}

function sentence(message: string): string {
  return message.charAt(0).toUpperCase() + message.slice(1) + (/[.!?]$/.test(message) ? "" : ".");
}

/**
 * Applies an API error to a form: 400 field messages go to their fields, everything else
 * becomes a form-level message. Returns the form-level message (or null).
 */
export function applyApiError<T extends FieldValues>(
  error: unknown,
  form: UseFormReturn<T>,
  overrides: Partial<Record<number, string>> = {},
): string | null {
  if (!isApiError(error)) return strings.errors.unexpected;
  const override = overrides[error.status];
  if (override) return override;

  if (error.kind === "validation") {
    const fields = Object.keys(form.getValues()) as Path<T>[];
    let applied = false;
    for (const [field, messages] of Object.entries(error.fieldErrors)) {
      if (fields.includes(field as Path<T>) && messages[0]) {
        form.setError(field as Path<T>, { type: "server", message: sentence(messages[0]) });
        applied = true;
      }
    }
    return applied ? null : error.serverMessages.map(sentence).join(" ") || error.message;
  }
  return error.message;
}

/** After a 429, keep submit disabled for a minute (the backend's window). */
export function useCooldown() {
  const [until, setUntil] = useState(0);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const start = useCallback((ms = 60_000) => {
    setUntil(Date.now() + ms);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => setUntil(0), ms);
  }, []);

  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    [],
  );

  return { coolingDown: until > 0, start };
}

/** Handles an error from a submit: rate limit cooldown plus mapping. */
export function useSubmitErrors<T extends FieldValues>(form: UseFormReturn<T>) {
  const [formError, setFormError] = useState<string | null>(null);
  const [focusKey, setFocusKey] = useState(0);
  const cooldown = useCooldown();

  const fail = useCallback(
    (error: unknown, overrides?: Partial<Record<number, string>>) => {
      if (error instanceof ApiError && error.kind === "rateLimited") cooldown.start();
      setFormError(applyApiError(error, form, overrides));
      setFocusKey((k) => k + 1);
    },
    [form, cooldown],
  );

  const onInvalid = useCallback(() => {
    setFormError(null);
    setFocusKey((k) => k + 1);
  }, []);

  const reset = useCallback(() => setFormError(null), []);

  return { formError, focusKey, fail, onInvalid, reset, coolingDown: cooldown.coolingDown };
}
