"use client";

import { CloudUpload, Download, RotateCcw, Trash2 } from "lucide-react";
import { useOnline } from "@/components/app/offline-banner";
import { Section } from "@/components/app/query-state";
import { PageSkeleton } from "@/components/app/route-guard";
import { Main, PageHeading } from "@/components/app/shell";
import { syncNow, useSyncState, useUnsent } from "@/components/app/sync-provider";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { Card, Money, Notice } from "@/components/ui/misc";
import { useToast } from "@/components/ui/toaster";
import { useSession } from "@/lib/auth/auth-provider";
import { formatDateTime } from "@/lib/dates";
import type { OutboxEntry } from "@/lib/db";
import { formatNaira } from "@/lib/money";
import { downloadCsv } from "@/lib/offline/export";
import { useLiveQuery } from "@/lib/offline/live";
import { otherAccountsCount, removeEntries, retryEntries } from "@/lib/offline/outbox";
import { strings } from "@/lib/strings";

const when = (ms: number) => formatDateTime(new Date(ms).toISOString());

/** Donations saved on this phone that the server has not confirmed yet. */
export function OutboxView() {
  const { user } = useSession();
  const userId = user?.id;
  const unsent = useUnsent(userId);
  const others = useLiveQuery(
    () => (userId ? otherAccountsCount(userId) : Promise.resolve(0)),
    `others:${userId ?? ""}`,
  );
  const online = useOnline();
  const state = useSyncState();
  const toast = useToast();

  if (!userId || !unsent) return <PageSkeleton />;

  const pending = unsent.filter((e) => e.status === "pending").length;
  const attention = unsent.length - pending;
  const byEvent = new Map<string, OutboxEntry[]>();
  for (const e of unsent) byEvent.set(e.eventId, [...(byEvent.get(e.eventId) ?? []), e]);

  const retry = async (ids?: string[]) => {
    await retryEntries(userId, ids);
    void syncNow(userId);
  };

  return (
    <Main>
      <PageHeading intro={strings.outbox.intro}>{strings.outbox.title}</PageHeading>

      <div className="flex flex-col gap-3">
        {unsent.length === 0 ? (
          <Card>
            <p className="text-lg font-semibold">{strings.outbox.empty}</p>
          </Card>
        ) : (
          <p className="text-lg font-semibold">
            {strings.outbox.badge(unsent.length)}
            {attention > 0 ? ` · ${strings.outbox.attention(attention)}` : ""}
          </p>
        )}
        {state.lastSentAt ? (
          <p className="text-muted">{strings.outbox.lastSent(when(state.lastSentAt))}</p>
        ) : null}
        {pending > 0 && state.lastError ? (
          <p className="text-muted">
            {strings.outbox.lastError(state.lastError)}{" "}
            {state.nextRetryAt ? strings.outbox.retryAt(when(state.nextRetryAt)) : null}
          </p>
        ) : null}
        <div className="flex flex-wrap gap-3">
          {pending > 0 ? (
            <Button
              disabled={!online || state.phase === "syncing"}
              onClick={() => void syncNow(userId)}
            >
              <CloudUpload aria-hidden />
              {state.phase === "syncing" ? strings.outbox.sending : strings.outbox.sendNow}
            </Button>
          ) : null}
          {attention > 0 ? (
            <Button variant="secondary" onClick={() => void retry()}>
              <RotateCcw aria-hidden />
              {strings.outbox.tryAgainAll}
            </Button>
          ) : null}
          {unsent.length > 0 ? (
            <Button variant="secondary" onClick={() => downloadCsv(unsent)}>
              <Download aria-hidden />
              {strings.outbox.download}
            </Button>
          ) : null}
        </div>
        {!online && pending > 0 ? (
          <Notice tone="warning">
            <p>{strings.sync.offlineSome(pending)}</p>
          </Notice>
        ) : null}
        {others ? (
          <Notice>
            <p>{strings.outbox.otherAccounts(others)}</p>
          </Notice>
        ) : null}
      </div>

      {[...byEvent.entries()].map(([eventId, entries]) => (
        <Section key={eventId} id={`outbox-${eventId}`} title={entries[0]!.eventName}>
          <ul className="flex flex-col gap-3">
            {entries.map((e) => {
              const amount = formatNaira(e.body.amountKobo);
              return (
                <li
                  key={e.id}
                  className="ov-border flex flex-col gap-1 rounded-xl border border-divider bg-surface p-4"
                >
                  <p>
                    <Money kobo={e.body.amountKobo} className="text-lg font-semibold" />{" "}
                    <span className="wrap-break-word">from {e.body.donorName}</span>
                  </p>
                  <p className="text-sm wrap-break-word text-muted">
                    {e.who} · {strings.paymentModes[e.body.paymentMode]} ·{" "}
                    {strings.outbox.savedAt(when(e.createdAt))}
                  </p>
                  {e.status === "attention" ? (
                    <p className="font-semibold wrap-break-word">
                      {strings.outbox.attentionStatus}: {e.problem}
                    </p>
                  ) : (
                    <p className="text-sm">{strings.outbox.pendingStatus}</p>
                  )}
                  {e.status === "attention" ? (
                    <div className="mt-2 flex flex-wrap gap-2">
                      <Button
                        variant="secondary"
                        aria-label={strings.outbox.tryAgainLabel(amount, e.body.donorName)}
                        onClick={() => void retry([e.id])}
                      >
                        <RotateCcw aria-hidden />
                        {strings.outbox.tryAgain}
                      </Button>
                      <ConfirmDialog
                        trigger={
                          <Button
                            variant="secondary"
                            aria-label={strings.outbox.deleteLabel(amount, e.body.donorName)}
                          >
                            <Trash2 aria-hidden />
                            {strings.outbox.delete}
                          </Button>
                        }
                        title={strings.outbox.deleteTitle}
                        description={strings.outbox.deleteBody}
                        confirmLabel={strings.outbox.delete}
                        cancelLabel={strings.org.cancel}
                        destructive
                        onConfirm={() =>
                          void removeEntries([e.id]).then(() =>
                            toast.show({ message: strings.outbox.deleted, tone: "success" }),
                          )
                        }
                      />
                    </div>
                  ) : null}
                </li>
              );
            })}
          </ul>
        </Section>
      ))}
    </Main>
  );
}
