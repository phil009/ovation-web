"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { LoaderCircle, Wifi, WifiOff } from "lucide-react";
import { useParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useForm, useWatch } from "react-hook-form";
import { useOnline } from "@/components/app/offline-banner";
import { QueryError, Section } from "@/components/app/query-state";
import { PageSkeleton } from "@/components/app/route-guard";
import { BackLink, LinkButton, Main, PageHeading } from "@/components/app/shell";
import { summaryItems, useSubmitErrors } from "@/components/forms/form-kit";
import { Button } from "@/components/ui/button";
import { ErrorSummary } from "@/components/ui/error-summary";
import { useAnnounce } from "@/components/ui/live-region";
import { Money, Notice } from "@/components/ui/misc";
import { useToast } from "@/components/ui/toaster";
import { api, call } from "@/lib/api/client";
import { ApiError } from "@/lib/api/errors";
import {
  donorNamesQuery,
  eventQuery,
  isClosedEventConflict,
  isNotFound,
  keys,
  summaryQuery,
  type DonationDto,
  type EventSummary,
} from "@/lib/api/queries";
import { roleAtLeast, useSession } from "@/lib/auth/auth-provider";
import { loadDraft, saveDraft, type DonationDraft } from "@/lib/db";
import { formatNaira, spokenNaira } from "@/lib/money";
import { strings } from "@/lib/strings";
import { cn } from "@/lib/utils";
import {
  GENERAL,
  donationCreateBody,
  donationSchema,
  sameDonation,
  type DonationValues,
} from "@/lib/validation";
import { useOrgRole } from "../../../org-shell";
import {
  DonationExtras,
  DonationFields,
  awardeeOptions,
  donationFieldIds,
  emptyDonation,
} from "../donation-fields";

/**
 * The entry screen: one donation after another, from the notebook. Online only for now
 * (M3); the offline outbox arrives in M4 without changing this layout.
 */
export function RecordView() {
  const { eventId } = useParams<{ eventId: string }>();
  const { orgId, role } = useOrgRole();
  const { user } = useSession();
  const event = useQuery(eventQuery(orgId, eventId));
  const summary = useQuery(summaryQuery(orgId, eventId));
  const back = (
    <BackLink href={`/orgs/${orgId}/events/${eventId}`}>{strings.awardees.backToEvent}</BackLink>
  );

  if (event.isPending || summary.isPending || role === undefined || !user) {
    return <PageSkeleton />;
  }

  const error = event.error ?? summary.error;
  if (error || !event.data || !summary.data) {
    return (
      <Main narrow>
        {back}
        <PageHeading>{strings.record.title}</PageHeading>
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

  const blocked = !roleAtLeast(role, "EDITOR")
    ? strings.record.blockedRole
    : event.data.closed
      ? strings.event.closedBanner
      : null;

  return (
    <Main narrow>
      {back}
      <PageHeading intro={event.data.name}>{strings.record.title}</PageHeading>
      {blocked ? (
        <Notice tone={event.data.closed ? "warning" : "info"}>
          <p>{blocked}</p>
        </Notice>
      ) : (
        <EntryForm
          orgId={orgId}
          eventId={eventId}
          summary={summary.data}
          userId={user.id}
          isAdmin={roleAtLeast(role, "ADMIN")}
        />
      )}
    </Main>
  );
}

interface SavedEntry {
  donation: DonationDto;
  who: string;
}

function toDraftValues(values: DonationValues): DonationDraft["values"] {
  const { awardeeId, donorName, amount, paymentMode, needsReview, note } = values;
  return { awardeeId, donorName, amount, paymentMode, needsReview, note };
}

/** Who a donation is for, and that awardee's (or the general) running total. */
function target(summary: EventSummary, awardeeId: string | null) {
  const awardee = awardeeId ? summary.awardees.find((a) => a.id === awardeeId) : undefined;
  if (!awardee) return { label: strings.record.general, kobo: summary.general.totalKobo };
  return {
    label: strings.record.awardeeOption(awardee.number, awardee.name),
    kobo: awardee.totalKobo,
  };
}

function EntryForm({
  orgId,
  eventId,
  summary,
  userId,
  isAdmin,
}: {
  orgId: string;
  eventId: string;
  summary: EventSummary;
  userId: string;
  isAdmin: boolean;
}) {
  const queryClient = useQueryClient();
  const toast = useToast();
  const announce = useAnnounce();
  const online = useOnline();
  const ids = donationFieldIds("record");
  const options = useMemo(() => awardeeOptions(summary), [summary]);
  const defaultAwardee = summary.awardees[0]?.id ?? GENERAL;
  const names = useQuery(donorNamesQuery(orgId, eventId));

  const form = useForm<DonationValues>({
    resolver: zodResolver(donationSchema),
    defaultValues: { ...emptyDonation, awardeeId: defaultAwardee },
    shouldFocusError: false,
  });
  const { formError, focusKey, fail, failWith, onInvalid, reset, coolingDown } =
    useSubmitErrors(form);
  const { errors, isSubmitting } = form.formState;
  const { reset: resetForm, setFocus, getValues } = form;

  // The client id is made when the form opens and kept until the server confirms the save,
  // so every retry (even after a reload, through the draft) is the same donation.
  const [clientId, setClientId] = useState<string | null>(null);
  const [restored, setRestored] = useState(false);
  const [moreOpen, setMoreOpen] = useState(false);
  const [recent, setRecent] = useState<SavedEntry[]>([]);
  const [saved, setSaved] = useState(0);

  // Bring back a half-typed donation (same event, same user).
  useEffect(() => {
    let alive = true;
    void loadDraft(eventId, userId).then((draft) => {
      if (!alive) return;
      if (draft) {
        const known =
          draft.values.awardeeId === GENERAL ||
          options.some((o) => o.value === draft.values.awardeeId);
        resetForm({
          ...emptyDonation,
          ...draft.values,
          awardeeId: known ? draft.values.awardeeId : defaultAwardee,
        });
        setRestored(Boolean(draft.values.donorName.trim() || draft.values.amount.trim()));
        setMoreOpen(Boolean(draft.values.note.trim() || draft.values.needsReview));
      }
      setClientId(draft?.clientId ?? crypto.randomUUID());
    });
    return () => {
      alive = false;
    };
    // Read once per event and user. The awardee list at that moment decides whether the
    // draft's awardee still exists.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [eventId, userId]);

  // Keep the draft up to date while typing.
  const watched = useWatch({ control: form.control });
  useEffect(() => {
    if (!clientId) return;
    const timer = setTimeout(() => {
      void saveDraft({ eventId, userId, clientId, values: toDraftValues(getValues()) });
    }, 400);
    return () => clearTimeout(timer);
  }, [watched, clientId, eventId, userId, getValues]);

  // After a save, focus goes back to the donor's name for the next entry. Done after the
  // re-render: focusing inside the submit handler is lost when the form resets.
  useEffect(() => {
    if (saved > 0) setFocus("donorName");
  }, [saved, setFocus]);

  /** Refreshes totals and donor names, then reads the new total out once. */
  const refresh = useCallback(
    (awardeeId: string | null) => {
      void Promise.all([
        queryClient.invalidateQueries({ queryKey: keys.summary(orgId, eventId) }),
        queryClient.invalidateQueries({ queryKey: keys.donations(orgId, eventId) }),
      ]).then(() => {
        const latest = queryClient.getQueryData<EventSummary>(keys.summary(orgId, eventId));
        if (!latest) return;
        const t = target(latest, awardeeId);
        announce(strings.record.totalAnnounce(t.label, spokenNaira(t.kobo)), {
          debounceMs: 1500,
        });
      });
    },
    [queryClient, orgId, eventId, announce],
  );

  const undo = useMutation({
    mutationFn: (d: DonationDto) =>
      call((signal) =>
        api.DELETE("/api/donations/{id}", { params: { path: { id: d.id } }, signal }),
      ),
    onSuccess: (_, d) => {
      setRecent((all) => all.filter((r) => r.donation.id !== d.id));
      toast.show({
        message: strings.record.undone(formatNaira(d.amountKobo), d.donorName),
        tone: "success",
      });
      refresh(d.awardeeId);
    },
    onError: () => toast.show({ message: strings.record.undoFailed, tone: "error" }),
  });
  const { mutate: undoMutate } = undo;

  const onSubmit = form.handleSubmit(async (values) => {
    if (!clientId) return;
    const body = donationCreateBody(values, { id: clientId, eventId });
    try {
      // Offline: don't even try. The values and the client id stay in the draft.
      if (!navigator.onLine) throw new ApiError(0, null, "network");
      const donation = await call((signal) => api.POST("/api/donations", { body, signal }));
      const nextId = crypto.randomUUID();
      setClientId(nextId);
      setRestored(false);
      const amount = formatNaira(donation.amountKobo);
      setRecent((all) =>
        [{ donation, who: target(summary, donation.awardeeId).label }, ...all].slice(0, 10),
      );

      if (sameDonation(body, donation)) {
        // Ready for the next donor: same awardee, same payment mode.
        const next: DonationValues = {
          ...emptyDonation,
          awardeeId: values.awardeeId,
          paymentMode: values.paymentMode,
        };
        resetForm(next);
        reset();
        setMoreOpen(false);
        void saveDraft({ eventId, userId, clientId: nextId, values: toDraftValues(next) });
        setSaved((n) => n + 1);
        toast.show({
          message: strings.record.saved(amount, donation.donorName),
          tone: "success",
          action: isAdmin
            ? {
                label: strings.record.undo,
                accessibleLabel: strings.record.undoLabel(amount, donation.donorName),
                onClick: () => {
                  undoMutate(donation);
                  setFocus("donorName");
                },
              }
            : undefined,
        });
      } else {
        // A retry after a lost response, with the form changed since: the server kept the
        // first version. Keep the new values, with a new id, so saving again adds them.
        failWith(strings.record.olderVersion(amount, donation.donorName));
      }
      refresh(donation.awardeeId);
    } catch (error) {
      const closed = isClosedEventConflict(error);
      if (closed) void queryClient.invalidateQueries({ queryKey: keys.event(orgId, eventId) });
      fail(error, {
        0: navigator.onLine ? undefined : strings.record.offlineError,
        409: closed ? strings.event.closedConflict : undefined,
      });
    }
  }, onInvalid);

  const awardeeId = useWatch({ control: form.control, name: "awardeeId" });
  const current = target(summary, awardeeId === GENERAL ? null : awardeeId);
  const showMore = moreOpen || Boolean(errors.note);

  return (
    <div className="flex flex-col gap-6">
      {/* Who and how much so far, always in view. Not a live region: saves are announced. */}
      <div className="ov-border sticky top-0 z-10 -mx-4 border-b border-divider bg-bg px-4 py-3">
        <p className="text-sm text-muted">{strings.record.recordingFor}</p>
        <p className="text-lg font-semibold wrap-break-word">{current.label}</p>
        <p className="flex flex-wrap items-baseline justify-between gap-x-3">
          <span>
            {strings.record.totalSoFar}{" "}
            <Money kobo={current.kobo} className="text-lg font-semibold" />
          </span>
          <SyncStatus online={online} saving={isSubmitting} />
        </p>
      </div>

      {restored ? (
        <Notice live="polite">
          <p>{strings.record.draftRestored}</p>
        </Notice>
      ) : null}
      {summary.awardees.length === 0 ? (
        <Notice>
          <p>{strings.record.noAwardees}</p>
        </Notice>
      ) : null}

      <ErrorSummary items={summaryItems(errors, ids, formError)} focusKey={focusKey} />
      <form
        noValidate
        onSubmit={onSubmit}
        // Focused fields scroll clear of the sticky bar (WCAG 2.4.11).
        className="flex flex-col gap-5 [&_button]:scroll-mt-36 [&_input]:scroll-mt-36 [&_select]:scroll-mt-36"
      >
        <DonationFields
          form={form}
          ids={ids}
          options={options}
          donorNames={names.data}
          quickAmounts
        />
        <details
          open={showMore}
          onToggle={(e) => setMoreOpen(e.currentTarget.open)}
          className="ov-border rounded-lg border border-divider bg-surface"
        >
          <summary className="flex min-h-12 cursor-pointer items-center px-4 font-semibold">
            {strings.record.more}
          </summary>
          <div className="flex flex-col gap-5 px-4 pb-4">
            <DonationExtras form={form} ids={ids} />
          </div>
        </details>
        <Button
          type="submit"
          size="wide"
          className="min-h-14 text-lg"
          disabled={isSubmitting || coolingDown || !clientId}
        >
          {isSubmitting ? strings.record.saving : strings.record.save}
        </Button>
      </form>

      <Section id="recent-heading" title={strings.record.recent} className="mt-4">
        {recent.length === 0 ? (
          <p className="text-muted">{strings.record.recentEmpty}</p>
        ) : (
          <ul className="flex flex-col gap-2">
            {recent.map(({ donation, who }) => (
              <li
                key={donation.id}
                className="ov-border flex flex-col rounded-lg border border-divider bg-surface px-4 py-3"
              >
                <span>
                  <Money kobo={donation.amountKobo} className="font-semibold" />{" "}
                  <span className="wrap-break-word">from {donation.donorName}</span>
                </span>
                <span className="text-sm wrap-break-word text-muted">
                  {strings.paymentModes[donation.paymentMode]} · {who}
                  {donation.needsReview ? ` · ${strings.donations.needsReview}` : ""}
                </span>
              </li>
            ))}
          </ul>
        )}
        {isAdmin ? null : <p className="text-sm text-muted">{strings.record.editorsCannotUndo}</p>}
        <LinkButton
          variant="secondary"
          href={`/orgs/${orgId}/events/${eventId}/donations`}
          className="self-start"
        >
          {strings.donations.all}
        </LinkButton>
      </Section>
    </div>
  );
}

/** Always visible, so the offline outbox (M4) can fill it in without a redesign. */
function SyncStatus({ online, saving }: { online: boolean; saving: boolean }) {
  const [Icon, text] = saving
    ? [LoaderCircle, strings.record.statusSaving]
    : online
      ? [Wifi, strings.record.statusOnline]
      : [WifiOff, strings.record.statusOffline];
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 text-sm",
        online ? "text-muted" : "font-semibold",
      )}
    >
      <Icon aria-hidden className={cn("size-4 shrink-0", saving && "motion-safe:animate-spin")} />
      {text}
    </span>
  );
}
