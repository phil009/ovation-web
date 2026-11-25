"use client";

import { useQueryClient } from "@tanstack/react-query";
import { CloudUpload, TriangleAlert } from "lucide-react";
import Link from "next/link";
import { useEffect, useSyncExternalStore, type ReactNode } from "react";
import { keys } from "@/lib/api/queries";
import { useSession } from "@/lib/auth/auth-provider";
import type { OutboxEntry } from "@/lib/db";
import { useLiveQuery } from "@/lib/offline/live";
import { unsentFor } from "@/lib/offline/outbox";
import type { SyncState } from "@/lib/offline/sync";
import { getSyncEngine } from "@/lib/offline/sync-browser";
import { strings } from "@/lib/strings";
import { useNow } from "@/lib/use-now";
import { cn } from "@/lib/utils";

/** Entries older than this get a warning: they should have been sent by now. */
export const STALE_AFTER_MS = 24 * 60 * 60 * 1000;

/**
 * Runs the sync engine for the signed-in user. It sends on start, whenever the app comes
 * back to the foreground or the connection returns, after every save (`useSaveTrigger`),
 * and on its own retry timer. No reliance on Background Sync, which iOS doesn't have.
 */
export function SyncProvider({ children }: { children: ReactNode }) {
  const { status, user } = useSession();
  const userId = status === "authenticated" ? user?.id : undefined;
  const queryClient = useQueryClient();

  useEffect(() => {
    if (!userId) return;
    const engine = getSyncEngine();
    const run = () => void engine.sync(userId);
    const onVisible = () => {
      if (document.visibilityState === "visible") run();
    };
    run();
    window.addEventListener("online", run);
    window.addEventListener("focus", run);
    document.addEventListener("visibilitychange", onVisible);
    // New donations reached the server: refresh those events' totals and lists.
    const off = engine.onSent((sent) => {
      for (const [eventId, { orgId }] of sent) {
        void queryClient.invalidateQueries({ queryKey: keys.summary(orgId, eventId) });
        void queryClient.invalidateQueries({ queryKey: keys.donations(orgId, eventId) });
      }
    });
    return () => {
      window.removeEventListener("online", run);
      window.removeEventListener("focus", run);
      document.removeEventListener("visibilitychange", onVisible);
      off();
      engine.stop();
    };
  }, [userId, queryClient]);

  return <>{children}</>;
}

const SERVER_STATE: SyncState = {
  phase: "idle",
  lastSentAt: null,
  lastError: null,
  nextRetryAt: null,
};

export function useSyncState(): SyncState {
  return useSyncExternalStore(
    (listener) => getSyncEngine().subscribe(listener),
    () => getSyncEngine().getSnapshot(),
    () => SERVER_STATE,
  );
}

/** This user's unsent donations (pending and needing attention), live across tabs. */
export function useUnsent(userId: string | undefined): OutboxEntry[] | undefined {
  return useLiveQuery(
    () => (userId ? unsentFor(userId) : Promise.resolve([])),
    `unsent:${userId ?? ""}`,
  );
}

/** Starts a sync now (after a save, or "Send now"). */
export function syncNow(userId: string): Promise<void> {
  return getSyncEngine().sync(userId);
}

/**
 * A slim bar under the header while donations wait to be sent, on every page, linking to the
 * list. Not a live region: the entry screen announces its own saves.
 */
export function UnsentBar() {
  const { status, user } = useSession();
  const unsent = useUnsent(status === "authenticated" ? user?.id : undefined);
  const now = useNow(60_000);
  if (!unsent || unsent.length === 0) return null;

  const attention = unsent.filter((e) => e.status === "attention").length;
  const oldest = unsent[0]?.createdAt ?? now;
  const stale = now - oldest > STALE_AFTER_MS;
  const warn = attention > 0 || stale;
  const Icon = warn ? TriangleAlert : CloudUpload;

  return (
    <p
      className={cn(
        "ov-border border-t border-divider px-4 py-2 text-center font-semibold",
        warn ? "bg-accent text-on-accent" : "bg-surface",
      )}
    >
      <Link
        href="/outbox"
        className="inline-flex min-h-12 items-center gap-2 underline underline-offset-4"
      >
        <Icon aria-hidden className="size-5 shrink-0" />
        {strings.outbox.badge(unsent.length)}
        {attention > 0 ? ` · ${strings.outbox.attention(attention)}` : ""}
      </Link>
      {stale ? (
        <span className="block text-sm font-normal">{strings.outbox.oldWarning}</span>
      ) : null}
    </p>
  );
}
