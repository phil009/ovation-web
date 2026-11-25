"use client";

import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { Flag, Pencil, Plus } from "lucide-react";
import Link from "next/link";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { ListSkeleton, QueryError } from "@/components/app/query-state";
import { PageSkeleton } from "@/components/app/route-guard";
import { BackLink, LinkButton, Main, PageHeading } from "@/components/app/shell";
import { Button, buttonVariants } from "@/components/ui/button";
import { SelectField } from "@/components/ui/choice";
import { Card, Money, Notice, StatusBadge } from "@/components/ui/misc";
import {
  DONATIONS_PAGE_SIZE,
  donationsQuery,
  eventQuery,
  isNotFound,
  summaryQuery,
  type DonationDto,
} from "@/lib/api/queries";
import { roleAtLeast } from "@/lib/auth/auth-provider";
import { formatDateTime } from "@/lib/dates";
import { formatNaira } from "@/lib/money";
import { strings } from "@/lib/strings";
import { useOrgRole } from "../../../org-shell";

const ALL = "all";

/**
 * Every donation at an event, in the order they were recorded, 100 a page. Filter by
 * awardee through the URL (?awardee=…&page=…), so Back and shared links work.
 */
export function DonationsView() {
  const { eventId } = useParams<{ eventId: string }>();
  const { orgId, role } = useOrgRole();
  const search = useSearchParams();
  const router = useRouter();
  const awardeeId = search.get("awardee") ?? undefined;
  const page = Math.max(0, Number.parseInt(search.get("page") ?? "0", 10) || 0);
  const filters = { awardeeId, offset: page * DONATIONS_PAGE_SIZE };

  const event = useQuery(eventQuery(orgId, eventId));
  const summary = useQuery(summaryQuery(orgId, eventId));
  const donations = useQuery({
    ...donationsQuery(orgId, eventId, filters),
    placeholderData: keepPreviousData,
  });
  const eventHref = `/orgs/${orgId}/events/${eventId}`;
  const listHref = `${eventHref}/donations`;
  const back = <BackLink href={eventHref}>{strings.awardees.backToEvent}</BackLink>;

  // After changing the filter or page, move focus to the results so it isn't lost.
  const resultsRef = useRef<HTMLHeadingElement>(null);
  const [navigated, setNavigated] = useState(false);
  useEffect(() => {
    if (navigated && !donations.isPlaceholderData) resultsRef.current?.focus();
  }, [navigated, donations.isPlaceholderData, awardeeId, page]);

  if (event.isPending || summary.isPending) return <PageSkeleton />;
  const error = event.error ?? summary.error;
  if (error || !event.data || !summary.data) {
    return (
      <Main>
        {back}
        <PageHeading>{strings.donations.title}</PageHeading>
        {isNotFound(error) ? (
          <Notice>{strings.errors.notFound}</Notice>
        ) : (
          <QueryError
            error={error}
            onRetry={() => {
              void event.refetch();
              void summary.refetch();
            }}
          />
        )}
      </Main>
    );
  }

  const closed = event.data.closed;
  const canRecord = roleAtLeast(role, "EDITOR") && !closed;
  const canEdit = roleAtLeast(role, "ADMIN") && !closed;
  const awardeeLabel = new Map(
    summary.data.awardees.map((a) => [a.id, strings.record.awardeeOption(a.number, a.name)]),
  );
  const filterOptions = [
    { value: ALL, label: strings.donations.filterAll },
    ...summary.data.awardees.map((a) => ({ value: a.id, label: awardeeLabel.get(a.id) ?? a.name })),
  ];

  const go = (next: { awardee?: string; page?: number }) => {
    const params = new URLSearchParams();
    if (next.awardee) params.set("awardee", next.awardee);
    if (next.page) params.set("page", String(next.page));
    const query = params.toString();
    setNavigated(true);
    router.push(query ? `${listHref}?${query}` : listHref);
  };

  const onFilter = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const value = new FormData(e.currentTarget).get("awardee");
    go({ awardee: typeof value === "string" && value !== ALL ? value : undefined });
  };

  return (
    <Main>
      {back}
      <PageHeading intro={event.data.name}>{strings.donations.title}</PageHeading>

      {canRecord ? (
        <LinkButton href={`${eventHref}/record`} className="mb-6 self-start">
          <Plus aria-hidden />
          {strings.record.open}
        </LinkButton>
      ) : null}

      {/* Filtering needs a button press, not a change event (WCAG 3.2.2). */}
      <form onSubmit={onFilter} className="flex flex-wrap items-end gap-3">
        <SelectField
          key={awardeeId ?? ALL}
          id="donations-filter"
          name="awardee"
          label={strings.donations.filterLabel}
          options={filterOptions}
          defaultValue={awardeeId ?? ALL}
          className="min-w-64"
        />
        <Button type="submit" variant="secondary">
          {strings.donations.show}
        </Button>
      </form>

      <section aria-labelledby="results-heading" className="mt-8 flex flex-col gap-4">
        {donations.isPending ? (
          <ListSkeleton rows={4} />
        ) : donations.isError ? (
          isNotFound(donations.error) ? (
            <Notice>{strings.errors.notFound}</Notice>
          ) : (
            <QueryError error={donations.error} onRetry={() => void donations.refetch()} />
          )
        ) : (
          <>
            <h2
              id="results-heading"
              ref={resultsRef}
              tabIndex={-1}
              className="text-2xl font-semibold outline-none"
            >
              {awardeeId
                ? strings.donations.viewFor(awardeeLabel.get(awardeeId) ?? "")
                : strings.donations.all}
              <span className="block text-base font-normal text-muted">
                {donations.data.total === 0
                  ? awardeeId
                    ? strings.donations.emptyFiltered
                    : strings.donations.empty
                  : donations.data.total > DONATIONS_PAGE_SIZE
                    ? strings.donations.range(
                        filters.offset + 1,
                        filters.offset + donations.data.items.length,
                        donations.data.total,
                      )
                    : strings.donations.count(donations.data.total)}
              </span>
            </h2>
            {donations.data.items.length > 0 ? (
              <ol className="flex flex-col gap-3" start={filters.offset + 1}>
                {donations.data.items.map((d) => (
                  <DonationItem
                    key={d.id}
                    donation={d}
                    who={
                      d.awardeeId
                        ? (awardeeLabel.get(d.awardeeId) ?? "")
                        : strings.donations.general
                    }
                    editHref={canEdit ? `${listHref}/${d.id}` : undefined}
                  />
                ))}
              </ol>
            ) : (
              <Card>
                <p>{awardeeId ? strings.donations.emptyFiltered : strings.donations.empty}</p>
              </Card>
            )}
            {donations.data.total > DONATIONS_PAGE_SIZE ? (
              <nav aria-label={strings.donations.title} className="flex gap-3">
                <Button
                  variant="secondary"
                  disabled={page === 0}
                  onClick={() => go({ awardee: awardeeId, page: page - 1 })}
                >
                  {strings.donations.previous}
                </Button>
                <Button
                  variant="secondary"
                  disabled={filters.offset + donations.data.items.length >= donations.data.total}
                  onClick={() => go({ awardee: awardeeId, page: page + 1 })}
                >
                  {strings.donations.next}
                </Button>
              </nav>
            ) : null}
          </>
        )}
      </section>
    </Main>
  );
}

function DonationItem({
  donation: d,
  who,
  editHref,
}: {
  donation: DonationDto;
  who: string;
  editHref?: string;
}) {
  return (
    <li className="ov-border flex flex-col gap-2 rounded-xl border border-divider bg-surface p-4">
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <p className="min-w-0 text-lg font-semibold wrap-break-word">{d.donorName}</p>
        <Money kobo={d.amountKobo} className="text-lg font-semibold" />
      </div>
      <p className="text-sm wrap-break-word text-muted">
        {strings.donations.forWho(who)} · {strings.paymentModes[d.paymentMode]} ·{" "}
        {strings.donations.recordedAt(formatDateTime(d.createdAt))}
      </p>
      <div className="flex flex-wrap items-center gap-2">
        <StatusBadge status={d.status} />
        {d.needsReview ? (
          <span className="ov-border inline-flex items-center gap-1 rounded-full border border-accent px-2.5 py-0.5 text-sm font-semibold">
            <Flag aria-hidden className="size-4" />
            {strings.donations.needsReview}
          </span>
        ) : null}
      </div>
      {d.note ? <p className="wrap-break-word">{d.note}</p> : null}
      {editHref ? (
        <Link
          href={editHref}
          aria-label={strings.donations.editLabel(d.donorName, formatNaira(d.amountKobo))}
          className={buttonVariants({ variant: "secondary", className: "self-start" })}
        >
          <Pencil aria-hidden />
          {strings.donations.edit}
        </Link>
      ) : null}
    </li>
  );
}
