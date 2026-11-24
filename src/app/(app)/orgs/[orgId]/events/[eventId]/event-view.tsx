"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CalendarDays, Clock, Lock, LockOpen, Pencil, Trash2 } from "lucide-react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useState, type ReactNode } from "react";
import { BackLink, Main, PageHeading } from "@/components/app/shell";
import { PageSkeleton } from "@/components/app/route-guard";
import { ListSkeleton, QueryError, ScrollRegion, Section } from "@/components/app/query-state";
import { Button, buttonVariants } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { Card, Money, Notice } from "@/components/ui/misc";
import { useToast } from "@/components/ui/toaster";
import { api, call } from "@/lib/api/client";
import { isApiError } from "@/lib/api/errors";
import {
  eventQuery,
  isClosedEventConflict,
  isNotFound,
  keys,
  summaryQuery,
  type EventDto,
  type EventSummary,
} from "@/lib/api/queries";
import { roleAtLeast } from "@/lib/auth/auth-provider";
import { formatEventDate } from "@/lib/dates";
import { strings } from "@/lib/strings";
import { cn } from "@/lib/utils";
import { ClosedBadge } from "../../events-view";
import { useOrgRole } from "../../org-shell";
import { AwardeeForm, emptyAwardee } from "./awardee-form";

export function EventView() {
  const { eventId } = useParams<{ eventId: string }>();
  const { orgId, role } = useOrgRole();
  const event = useQuery(eventQuery(orgId, eventId));
  const back = <BackLink href={`/orgs/${orgId}`}>{strings.events.back}</BackLink>;

  if (event.isPending) return <PageSkeleton />;
  if (event.isError) {
    return (
      <Main>
        {back}
        <PageHeading>
          {isNotFound(event.error) ? strings.notFound.title : strings.org.event}
        </PageHeading>
        {isNotFound(event.error) ? (
          <Notice>{strings.errors.notFound}</Notice>
        ) : (
          <QueryError error={event.error} onRetry={() => void event.refetch()} />
        )}
      </Main>
    );
  }

  const data = event.data;
  const canAdd = roleAtLeast(role, "EDITOR") && !data.closed;
  const isAdmin = roleAtLeast(role, "ADMIN");

  return (
    <Main>
      {back}
      <PageHeading
        intro={
          <span className="flex flex-wrap items-center gap-x-3 gap-y-1">
            <span className="inline-flex items-center gap-1.5">
              <CalendarDays aria-hidden className="size-5" />
              {formatEventDate(data.date)}
            </span>
            {data.closed ? <ClosedBadge /> : null}
          </span>
        }
      >
        {data.name}
      </PageHeading>

      {data.closed ? (
        <Notice tone="warning">
          <p>{strings.event.closedBanner}</p>
        </Notice>
      ) : null}

      {isAdmin ? <CloseReopen event={data} /> : null}

      <SummarySection event={data} isAdmin={isAdmin} />

      {canAdd ? <AddAwardee orgId={orgId} eventId={eventId} /> : null}
    </Main>
  );
}

function CloseReopen({ event }: { event: EventDto }) {
  const { orgId } = useOrgRole();
  const queryClient = useQueryClient();
  const toast = useToast();
  const [error, setError] = useState<string | null>(null);
  const closing = !event.closed;

  const mutation = useMutation({
    mutationFn: () =>
      call((signal) =>
        closing
          ? api.PATCH("/api/events/{id}/close", { params: { path: { id: event.id } }, signal })
          : api.PATCH("/api/events/{id}/reopen", { params: { path: { id: event.id } }, signal }),
      ),
    onSuccess: async (updated) => {
      setError(null);
      queryClient.setQueryData(keys.event(orgId, event.id), updated);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: keys.events(orgId) }),
        queryClient.invalidateQueries({ queryKey: keys.summary(orgId, event.id) }),
      ]);
      toast.show({
        message: updated.closed ? strings.event.closedToast : strings.event.reopenedToast,
        tone: "success",
      });
    },
    onError: (e) => setError(isApiError(e) ? e.message : strings.errors.unexpected),
  });

  return (
    <div className="mt-4 flex flex-col gap-3">
      {error ? (
        <Notice tone="error" live="assertive">
          <p>{error}</p>
        </Notice>
      ) : null}
      <ConfirmDialog
        trigger={
          <Button variant="secondary" className="self-start" disabled={mutation.isPending}>
            {closing ? <Lock aria-hidden /> : <LockOpen aria-hidden />}
            {mutation.isPending
              ? strings.form.wait
              : closing
                ? strings.event.close
                : strings.event.reopen}
          </Button>
        }
        title={closing ? strings.event.closeTitle : strings.event.reopenTitle}
        description={closing ? strings.event.closeBody : strings.event.reopenBody}
        confirmLabel={closing ? strings.event.closeConfirm : strings.event.reopenConfirm}
        cancelLabel={strings.org.cancel}
        onConfirm={() => mutation.mutate()}
      />
    </div>
  );
}

const isPositive = (kobo: string) => /^\d+$/.test(kobo) && BigInt(kobo) > 0n;

function SummarySection({ event, isAdmin }: { event: EventDto; isAdmin: boolean }) {
  const { orgId } = useOrgRole();
  const summary = useQuery(summaryQuery(orgId, event.id));

  return (
    <Section id="summary-heading" title={strings.event.summary}>
      {summary.isPending ? (
        <ListSkeleton rows={2} />
      ) : summary.isError ? (
        <QueryError error={summary.error} onRetry={() => void summary.refetch()} />
      ) : (
        <>
          <SummaryTable summary={summary.data} showActions={isAdmin && !event.closed} />
          <Totals summary={summary.data} />
        </>
      )}
    </Section>
  );
}

const cell = "border-b border-divider px-3 py-3 align-top";

function SummaryTable({ summary, showActions }: { summary: EventSummary; showActions: boolean }) {
  const { orgId } = useOrgRole();
  const queryClient = useQueryClient();
  const toast = useToast();
  const [error, setError] = useState<string | null>(null);
  const captionId = "summary-caption";

  const remove = useMutation({
    mutationFn: (awardee: { id: string; name: string }) =>
      call((signal) =>
        api.DELETE("/api/events/{eventId}/awardees/{id}", {
          params: { path: { eventId: summary.event.id, id: awardee.id } },
          signal,
        }),
      ),
    onSuccess: async (_, awardee) => {
      setError(null);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: keys.summary(orgId, summary.event.id) }),
        queryClient.invalidateQueries({ queryKey: keys.awardees(orgId, summary.event.id) }),
      ]);
      toast.show({ message: strings.awardees.deleted(awardee.name), tone: "success" });
    },
    onError: (e) => {
      if (isClosedEventConflict(e)) {
        setError(strings.event.closedConflict);
        void queryClient.invalidateQueries({ queryKey: keys.event(orgId, summary.event.id) });
      } else if (isApiError(e) && e.status === 409) {
        setError(strings.awardees.hasDonations);
      } else {
        setError(isApiError(e) ? e.message : strings.errors.unexpected);
      }
    },
  });

  if (summary.awardees.length === 0 && summary.general.count === 0) {
    return (
      <Card>
        <p className="text-lg font-semibold">{strings.event.noAwardees}</p>
      </Card>
    );
  }

  return (
    <>
      {error ? (
        <Notice tone="error" live="assertive">
          <p>{error}</p>
        </Notice>
      ) : null}
      <p className="text-sm text-muted sm:hidden">{strings.event.scrollHint}</p>
      <ScrollRegion labelledBy={captionId}>
        <table className="w-full min-w-[40rem] border-collapse text-left">
          <caption id={captionId} className="sr-only">
            {strings.event.summaryCaption(summary.event.name)}
          </caption>
          <thead>
            <tr className="text-sm text-muted">
              <th scope="col" className={cn(cell, "w-16")}>
                {strings.event.colNumber}
              </th>
              <th scope="col" className={cell}>
                {strings.event.colAwardee}
              </th>
              <th scope="col" className={cn(cell, "text-right")}>
                {strings.event.colOwn}
              </th>
              <th scope="col" className={cn(cell, "text-right")}>
                {strings.event.colSupporters}
              </th>
              <th scope="col" className={cn(cell, "text-right")}>
                {strings.event.colTotal}
              </th>
              {showActions ? (
                <th scope="col" className={cell}>
                  {strings.event.colActions}
                </th>
              ) : null}
            </tr>
          </thead>
          <tbody>
            {summary.awardees.map((a) => (
              <tr key={a.id}>
                <td className={cn(cell, "tabular")}>{a.number ?? ""}</td>
                <th scope="row" className={cn(cell, "font-semibold wrap-break-word")}>
                  {a.name}
                </th>
                <td className={cn(cell, "text-right")}>
                  <Money kobo={a.awardeeKobo} />
                  {a.paymentMode && isPositive(a.awardeeKobo) ? (
                    <span className="block text-sm text-muted">
                      {strings.paymentModes[a.paymentMode]}
                    </span>
                  ) : null}
                </td>
                <td className={cn(cell, "text-right")}>
                  <Money kobo={a.supportersKobo} />
                  <span className="block text-sm text-muted">
                    {strings.event.supporterCount(a.supporterCount)}
                  </span>
                </td>
                <td className={cn(cell, "text-right font-semibold")}>
                  <Money kobo={a.totalKobo} />
                  {isPositive(a.pledgedKobo) ? <PledgedPart kobo={a.pledgedKobo} /> : null}
                </td>
                {showActions ? (
                  <td className={cell}>
                    <div className="flex gap-2">
                      <Link
                        href={`/orgs/${orgId}/events/${summary.event.id}/awardees/${a.id}`}
                        aria-label={strings.awardees.editLabel(a.name)}
                        className={buttonVariants({ variant: "secondary", size: "icon" })}
                      >
                        <Pencil aria-hidden />
                      </Link>
                      <ConfirmDialog
                        trigger={
                          <Button
                            variant="secondary"
                            size="icon"
                            aria-label={strings.awardees.deleteLabel(a.name)}
                            disabled={remove.isPending}
                          >
                            <Trash2 aria-hidden />
                          </Button>
                        }
                        title={strings.awardees.deleteTitle(a.name)}
                        description={strings.awardees.deleteBody}
                        confirmLabel={strings.awardees.delete}
                        cancelLabel={strings.org.cancel}
                        destructive
                        onConfirm={() => remove.mutate({ id: a.id, name: a.name })}
                      />
                    </div>
                  </td>
                ) : null}
              </tr>
            ))}
          </tbody>
          <tfoot>
            {/* Row headers span the empty columns, so there are no empty cells. */}
            <tr>
              <th scope="row" colSpan={4} className={cn(cell, "font-semibold")}>
                {strings.event.general}
                <span className="block text-sm font-normal text-muted">
                  {strings.event.generalCount(summary.general.count)}
                </span>
              </th>
              <td colSpan={showActions ? 2 : 1} className={cn(cell, "text-right font-semibold")}>
                <Money kobo={summary.general.totalKobo} />
                {isPositive(summary.general.pledgedKobo) ? (
                  <PledgedPart kobo={summary.general.pledgedKobo} />
                ) : null}
              </td>
            </tr>
            <tr className="text-lg">
              <th scope="row" colSpan={2} className="px-3 py-4 font-semibold">
                {strings.event.grandTotal}
              </th>
              <td className="px-3 py-4 text-right">
                <Money kobo={summary.totals.awardeesKobo} />
              </td>
              <td className="px-3 py-4 text-right">
                <Money kobo={summary.totals.supportersKobo} />
              </td>
              <td colSpan={showActions ? 2 : 1} className="px-3 py-4 text-right font-bold">
                <Money kobo={summary.totals.totalKobo} />
              </td>
            </tr>
          </tfoot>
        </table>
      </ScrollRegion>
    </>
  );
}

/** "₦50,000 pledged", with an icon: never colour alone. */
function PledgedPart({ kobo }: { kobo: string }) {
  return (
    <span className="mt-1 inline-flex items-center gap-1 text-sm font-normal text-pledged-fg">
      <Clock aria-hidden className="size-4" />
      <Money kobo={kobo} /> {strings.event.pledgedPart}
    </span>
  );
}

function Totals({ summary }: { summary: EventSummary }) {
  const t = summary.totals;
  const items: [string, ReactNode][] = [
    [strings.event.grandTotal, <Money key="t" kobo={t.totalKobo} />],
    [strings.event.received, <Money key="r" kobo={t.receivedKobo} />],
    [strings.event.pledged, <Money key="p" kobo={t.pledgedKobo} />],
    [
      strings.event.donationCount,
      <span key="c" className="tabular">
        {t.donationCount}
      </span>,
    ],
  ];
  return (
    <section aria-labelledby="totals-heading" className="mt-2">
      <h3 id="totals-heading" className="sr-only">
        {strings.event.totalsTitle}
      </h3>
      <dl className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {items.map(([label, value]) => (
          <div key={label} className="ov-border rounded-xl border border-divider bg-surface p-4">
            <dt className="text-sm text-muted">{label}</dt>
            <dd className="text-2xl font-semibold">{value}</dd>
          </div>
        ))}
      </dl>
    </section>
  );
}

function AddAwardee({ orgId, eventId }: { orgId: string; eventId: string }) {
  const queryClient = useQueryClient();
  const toast = useToast();

  return (
    <Section id="add-awardee-heading" title={strings.awardees.add}>
      <p className="text-muted">{strings.awardees.addIntro}</p>
      <AwardeeForm
        idPrefix="new-awardee"
        mode="create"
        defaultValues={emptyAwardee}
        onClosedEvent={() =>
          void queryClient.invalidateQueries({ queryKey: keys.event(orgId, eventId) })
        }
        onSave={async (body, values) => {
          const created = await call((signal) =>
            api.POST("/api/events/{eventId}/awardees", {
              params: { path: { eventId } },
              body,
              signal,
            }),
          );
          await Promise.all([
            queryClient.invalidateQueries({ queryKey: keys.summary(orgId, eventId) }),
            queryClient.invalidateQueries({ queryKey: keys.awardees(orgId, eventId) }),
          ]);
          toast.show({ message: strings.awardees.added(created.name), tone: "success" });
          // Ready for the next one: the following notebook number, same payment mode.
          return {
            ...emptyAwardee,
            number: created.number === null ? "" : String(created.number + 1),
            paymentMode: values.paymentMode,
          };
        }}
      />
    </Section>
  );
}
