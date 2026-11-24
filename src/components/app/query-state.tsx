"use client";

import type { ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { Notice, Skeleton } from "@/components/ui/misc";
import { isApiError } from "@/lib/api/errors";
import { strings } from "@/lib/strings";
import { cn } from "@/lib/utils";

/** Placeholder rows while a list loads. Screen readers hear "Loading…" once. */
export function ListSkeleton({ rows = 3, className }: { rows?: number; className?: string }) {
  return (
    <div aria-busy="true" className={cn("flex flex-col gap-3", className)}>
      <span className="sr-only">{strings.app.loading}</span>
      {Array.from({ length: rows }, (_, i) => (
        <Skeleton key={i} className="h-20" />
      ))}
    </div>
  );
}

/** A failed read, with a retry button. */
export function QueryError({ error, onRetry }: { error: unknown; onRetry: () => void }) {
  return (
    <Notice tone="error" live="assertive">
      <div className="flex flex-wrap items-center gap-3">
        <p className="flex-1">{isApiError(error) ? error.message : strings.errors.unexpected}</p>
        <Button variant="secondary" onClick={onRetry}>
          {strings.coldStart.retry}
        </Button>
      </div>
    </Notice>
  );
}

/** A titled section with its own h2, labelled for landmarks and the heading outline. */
export function Section({
  id,
  title,
  children,
  actions,
  className,
}: {
  id: string;
  title: ReactNode;
  children: ReactNode;
  actions?: ReactNode;
  className?: string;
}) {
  return (
    <section aria-labelledby={id} className={cn("mt-10 flex flex-col gap-4", className)}>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 id={id} className="text-2xl font-semibold">
          {title}
        </h2>
        {actions}
      </div>
      {children}
    </section>
  );
}

/**
 * A horizontally scrollable wrapper for wide tables. It must be focusable so keyboard users
 * can scroll it (axe: scrollable-region-focusable), and it is a labelled region so screen
 * readers announce what gains focus (allowed for role=region in eslint.config.mjs).
 * `relative` matters: screen-reader-only text is absolutely positioned, and without a
 * positioned ancestor it escapes the scroll box and widens the whole page on phones.
 */
export function ScrollRegion({
  labelledBy,
  children,
}: {
  labelledBy: string;
  children: ReactNode;
}) {
  return (
    <div
      role="region"
      aria-labelledby={labelledBy}
      tabIndex={0}
      className="ov-border relative overflow-x-auto rounded-xl border border-divider bg-surface"
    >
      {children}
    </div>
  );
}
