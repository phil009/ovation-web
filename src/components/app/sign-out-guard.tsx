"use client";

import { Download } from "lucide-react";
import { useEffect, useRef } from "react";
import { Button } from "@/components/ui/button";
import type { OutboxEntry } from "@/lib/db";
import { downloadCsv } from "@/lib/offline/export";
import { strings } from "@/lib/strings";

/**
 * Shown instead of signing out straight away while donations are still on this phone.
 * Signing out never deletes them: they are sent when the same account signs in again. The
 * copy is for a phone that someone else will use next. Focus moves to the heading.
 */
export function SignOutWarning({
  entries,
  onConfirm,
  onCancel,
  pending,
}: {
  entries: readonly OutboxEntry[];
  onConfirm: () => void;
  onCancel: () => void;
  pending?: boolean;
}) {
  const heading = useRef<HTMLHeadingElement>(null);
  useEffect(() => heading.current?.focus(), []);

  return (
    <section
      aria-labelledby="sign-out-warning"
      className="ov-border flex flex-col gap-3 rounded-lg border-2 border-l-8 border-accent bg-surface p-4"
    >
      <h3
        id="sign-out-warning"
        ref={heading}
        tabIndex={-1}
        className="text-xl font-semibold outline-none"
      >
        {strings.signOutGuard.title(entries.length)}
      </h3>
      <p>{strings.signOutGuard.body}</p>
      <div className="flex flex-wrap gap-3">
        <Button variant="secondary" onClick={() => downloadCsv(entries)}>
          <Download aria-hidden />
          {strings.outbox.download}
        </Button>
        <Button variant="danger" disabled={pending} onClick={onConfirm}>
          {strings.signOutGuard.signOutAnyway}
        </Button>
        <Button variant="ghost" onClick={onCancel}>
          {strings.signOutGuard.cancel}
        </Button>
      </div>
    </section>
  );
}
