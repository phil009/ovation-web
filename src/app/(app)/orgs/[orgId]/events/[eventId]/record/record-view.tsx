"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CloudUpload, LoaderCircle, TriangleAlert, Wifi, WifiOff } from "lucide-react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { useForm, useWatch } from "react-hook-form";
import { useOnline } from "@/components/app/offline-banner";
import { QueryError, Section } from "@/components/app/query-state";
import { PageSkeleton } from "@/components/app/route-guard";
import { BackLink, LinkButton, Main, PageHeading } from "@/components/app/shell";
import { syncNow, useSyncState, useUnsent } from "@/components/app/sync-provider";
import { summaryItems, useSubmitErrors } from "@/components/forms/form-kit";
import { Button } from "@/components/ui/button";
import { ErrorSummary } from "@/components/ui/error-summary";
import { useAnnounce } from "@/components/ui/live-region";
import { Money, Notice } from "@/components/ui/misc";
import { useToast } from "@/components/ui/toaster";
import { isApiError } from "@/lib/api/errors";
import {
  donorNamesQuery,
  eventQuery,
  isNotFound,
  isUnreachable,
  keys,
  summaryQuery,
} from "@/lib/api/queries";
import { roleAtLeast, useSession } from "@/lib/auth/auth-provider";
import { formatDateTime } from "@/lib/dates";
import { loadDraft, saveDraft, type DonationDraft, type OutboxEntry } from "@/lib/db";
import { formatNaira, spokenNaira, sumKobo } from "@/lib/money";
import { entryDataFrom, kitFrom, loadKit, saveKit, type EntryData } from "@/lib/offline/kits";
import { useLiveQuery } from "@/lib/offline/live";
import { enqueue } from "@/lib/offline/outbox";
import { requestPersistentStorage } from "@/lib/offline/storage";
import { getSyncEngine } from "@/lib/offline/sync-browser";
import { strings } from "@/lib/strings";
import { useNow } from "@/lib/use-now";
import { cn } from "@/lib/utils";
import {
  GENERAL,
  donationCreateBody,
  donationSchema,
  type CreateDonationBody,
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
 * The entry screen: one donation after another, from the notebook. Saving writes to this
 * phone first (the outbox) and the sync engine sends it, so it works the same with or
 * without a connection. Offline, the event and awardees come from the kit saved the last
 * time this screen loaded online.
 */
export function RecordView() {
  const { eventId } = useParams<{ eventId: string }>();
  const { orgId, role } = useOrgRole();
  const { user } = useSession();
  const userId = user?.id;
  const event = useQuery(eventQuery(orgId, eventId));
  const summary = useQuery(summaryQuery(orgId, eventId));
  const kit = useLiveQuery(
    () => (userId ? loadKit(eventId, userId) : Promise.resolve(null)),
    `kit:${eventId}:${userId ?? ""}`,
  );
  const back = (
    <BackLink href={`/orgs/${orgId}/events/${eventId}`}>{strings.awardees.backToEvent}</BackLink>
  );

  // Keep the offline kit up to date whenever the screen has live data.
  const liveRole = role;
  useEffect(() => {
    if (!userId || !event.data || !summary.data || !liveRole) return;
    void saveKit(kitFrom({ orgId, userId }, event.data, summary.data, liveRole));
  }, [orgId, userId, event.data, summary.data, liveRole]);

  // No answer because there is no connection (paused offline, or a network error).
  const unreachable = isUnreachable(event) || isUnreachable(summary);

  let data: EntryData | null = null;
  if (event.data && summary.data && (role ?? kit?.role)) {
    data = {
      eventName: event.data.name,
      closed: event.data.closed,
      role: (role ?? kit?.role)!,
      awardees: summary.data.awardees,
      generalKobo: summary.data.general.totalKobo,
      savedAt: null,
    };
  } else if (unreachable && kit) {
    data = entryDataFrom(kit, false);
  }

  if (!user || kit === undefined) return <PageSkeleton />;
  if (!data) {
    if (unreachable && !kit) {
      return (
        <Main narrow>
          {back}
          <PageHeading>{strings.record.title}</PageHeading>
          <Notice tone="warning">
            <p>{strings.offlineRecord.pageNeedsConnection}</p>
            <p className="mt-2">{strings.offlineRecord.none}</p>
          </Notice>
        </Main>
      );
    }
    const error = event.error ?? summary.error;
    if (!error) return <PageSkeleton />;
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

  const blocked = !roleAtLeast(data.role, "EDITOR")
    ? strings.record.blockedRole
    : data.closed
      ? strings.event.closedBanner
      : null;

  return (
    <Main narrow>
      {back}
      <PageHeading intro={data.eventName}>{strings.record.title}</PageHeading>
      {data.savedAt !== null ? (
        <Notice tone="warning" className="mb-6">
          <p>
            {strings.offlineRecord.usingSaved(formatDateTime(new Date(data.savedAt).toISOString()))}
          </p>
        </Notice>
      ) : null}
      {blocked ? (
        <Notice tone={data.closed ? "warning" : "info"}>
          <p>{blocked}</p>
        </Notice>
      ) : (
        <EntryForm
          orgId={orgId}
          eventId={eventId}
          data={data}
          userId={user.id}
          isAdmin={roleAtLeast(data.role, "ADMIN")}
        />
      )}
    </Main>
  );
}

/** Editors may undo their own sent entry for 10 minutes (the API enforces it). */
const OWN_UNDO_MS = 10 * 60 * 1000;

interface SavedEntry {
  id: string;
  body: CreateDonationBody;
  who: string;
  savedAt: number;
}

function toDraftValues(values: DonationValues): DonationDraft["values"] {
  const { awardeeId, donorName, amount, paymentMode, needsReview, note } = values;
  return { awardeeId, donorName, amount, paymentMode, needsReview, note };
}

/** Who a donation is for, and that awardee's (or the general) running total on the server. */
function target(data: EntryData, awardeeId: string | null | undefined) {
  const awardee = awardeeId ? data.awardees.find((a) => a.id === awardeeId) : undefined;
  if (!awardee) return { label: strings.record.general, kobo: data.generalKobo };
  return {
    label: strings.record.awardeeOption(awardee.number, awardee.name),
    kobo: awardee.totalKobo,
  };
}

function EntryForm({
  orgId,
  eventId,
  data,
  userId,
  isAdmin,
}: {
  orgId: string;
  eventId: string;
  data: EntryData;
  userId: string;
  isAdmin: boolean;
}) {
  const toast = useToast();
  const announce = useAnnounce();
  const queryClient = useQueryClient();
  const ids = donationFieldIds("record");
  const options = useMemo(() => awardeeOptions(data.awardees), [data.awardees]);
  const defaultAwardee = data.awardees[0]?.id ?? GENERAL;
  const names = useQuery(donorNamesQuery(orgId, eventId));
  const unsent = useUnsent(userId);
  const now = useNow();

  const form = useForm<DonationValues>({
    resolver: zodResolver(donationSchema),
    defaultValues: { ...emptyDonation, awardeeId: defaultAwardee },
    shouldFocusError: false,
  });
  const { formError, focusKey, failWith, onInvalid, reset } = useSubmitErrors(form);
  const { errors, isSubmitting } = form.formState;
  const { reset: resetForm, setFocus, getValues } = form;

  const [draftLoaded, setDraftLoaded] = useState(false);
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
      setDraftLoaded(true);
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
    if (!draftLoaded) return;
    const timer = setTimeout(() => {
      void saveDraft({ eventId, userId, values: toDraftValues(getValues()) });
    }, 400);
    return () => clearTimeout(timer);
  }, [watched, draftLoaded, eventId, userId, getValues]);

  // After a save, focus goes back to the donor's name for the next entry. Done after the
  // re-render: focusing inside the submit handler is lost when the form resets.
  useEffect(() => {
    if (saved > 0) setFocus("donorName");
  }, [saved, setFocus]);

  const awardeeId = useWatch({ control: form.control, name: "awardeeId" });
  const targetId = awardeeId === GENERAL ? null : awardeeId;
  const current = target(data, targetId);

  // Read the new server total out once it changes (after a send), not on first render.
  const announced = useRef<string | null>(null);
  useEffect(() => {
    const key = `${current.label}:${current.kobo}`;
    if (data.savedAt === null && announced.current !== null && announced.current !== key) {
      if (announced.current.startsWith(`${current.label}:`)) {
        announce(strings.record.totalAnnounce(current.label, spokenNaira(current.kobo)), {
          debounceMs: 1500,
        });
      }
    }
    announced.current = key;
  }, [current.label, current.kobo, data.savedAt, announce]);

  // This event's entries still on the phone, by id, and the part of this total not yet sent.
  const unsentHere = useMemo(
    () => (unsent ?? []).filter((e) => e.eventId === eventId),
    [unsent, eventId],
  );
  const byId = useMemo(() => new Map(unsentHere.map((e) => [e.id, e])), [unsentHere]);
  const notSentKobo = sumKobo(
    unsentHere.filter((e) => (e.body.awardeeId ?? null) === targetId).map((e) => e.body.amountKobo),
  );

  const undo = useMutation({
    mutationFn: (entry: SavedEntry) => getSyncEngine().undo(entry.id, userId),
    // Undoing an unsent entry is local, so it must run offline too (the app default pauses
    // mutations offline). A sent one fails with a network error, which says so.
    networkMode: "always",
    onSuccess: (where, entry) => {
      setRecent((all) => all.filter((r) => r.id !== entry.id));
      // Deleted on the server: its totals and lists changed (an unsent one never counted).
      if (where === "server") {
        void queryClient.invalidateQueries({ queryKey: keys.summary(orgId, eventId) });
        void queryClient.invalidateQueries({ queryKey: keys.donations(orgId, eventId) });
      }
      toast.show({
        message: strings.record.undone(formatNaira(entry.body.amountKobo), entry.body.donorName),
        tone: "success",
      });
    },
    onError: (e) =>
      toast.show({
        message:
          isApiError(e) && e.status === 403
            ? strings.record.undoTooLate
            : strings.record.undoFailed,
        tone: "error",
      }),
  });
  const { mutate: undoMutate } = undo;

  const onSubmit = form.handleSubmit(async (values) => {
    const id = crypto.randomUUID();
    const body = donationCreateBody(values, { id, eventId });
    const who = target(data, body.awardeeId).label;
    let row: OutboxEntry;
    try {
      // Saved once it is on the phone. Sending is the sync engine's job, online or not.
      row = await enqueue({ id, userId, orgId, eventId, body, who, eventName: data.eventName });
    } catch {
      failWith(strings.record.storageFailed);
      return;
    }
    void requestPersistentStorage();
    void syncNow(userId);

    const entry: SavedEntry = { id, body, who, savedAt: row.createdAt };
    setRecent((all) => [entry, ...all].slice(0, 10));
    setRestored(false);
    // Ready for the next donor: same awardee, same payment mode.
    const next: DonationValues = {
      ...emptyDonation,
      awardeeId: values.awardeeId,
      paymentMode: values.paymentMode,
    };
    resetForm(next);
    reset();
    setMoreOpen(false);
    void saveDraft({ eventId, userId, values: toDraftValues(next) });
    setSaved((n) => n + 1);
    const amount = formatNaira(body.amountKobo);
    toast.show({
      message: strings.record.saved(amount, body.donorName),
      tone: "success",
      action: {
        label: strings.record.undo,
        accessibleLabel: strings.record.undoLabel(amount, body.donorName),
        onClick: () => {
          undoMutate(entry);
          setFocus("donorName");
        },
      },
    });
  }, onInvalid);

  const showMore = moreOpen || Boolean(errors.note);

  return (
    <div className="flex flex-col gap-6">
      {/* Who and how much so far, always in view. Not a live region: saves are announced. */}
      <div className="ov-border sticky top-0 z-10 -mx-4 border-b border-divider bg-bg px-4 py-3">
        <p className="text-sm text-muted">{strings.record.recordingFor}</p>
        <p className="text-lg font-semibold wrap-break-word">{current.label}</p>
        <p>
          {strings.record.totalSoFar}{" "}
          <Money kobo={current.kobo} className="text-lg font-semibold" />
          {BigInt(notSentKobo) > 0n ? (
            <span className="block text-sm text-muted">
              {strings.record.notSentYet(formatNaira(notSentKobo))}
            </span>
          ) : null}
        </p>
        <SyncStatus userId={userId} unsent={unsent ?? []} />
      </div>

      {restored ? (
        <Notice live="polite">
          <p>{strings.record.draftRestored}</p>
        </Notice>
      ) : null}
      {data.awardees.length === 0 ? (
        <Notice>
          <p>{strings.record.noAwardees}</p>
        </Notice>
      ) : null}

      <ErrorSummary items={summaryItems(errors, ids, formError)} focusKey={focusKey} />
      <form
        noValidate
        onSubmit={onSubmit}
        // Focused fields scroll clear of the sticky bar (WCAG 2.4.11).
        className="flex flex-col gap-5 [&_button]:scroll-mt-44 [&_input]:scroll-mt-44 [&_select]:scroll-mt-44"
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
          disabled={isSubmitting || !draftLoaded}
        >
          {isSubmitting ? strings.record.saving : strings.record.save}
        </Button>
      </form>

      <Section id="recent-heading" title={strings.record.recent} className="mt-4">
        {recent.length === 0 ? (
          <p className="text-muted">{strings.record.recentEmpty}</p>
        ) : (
          <ul className="flex flex-col gap-2">
            {recent.map((entry) => (
              <RecentItem
                key={entry.id}
                entry={entry}
                stillHere={byId.get(entry.id)}
                canUndo={isAdmin || byId.has(entry.id) || now - entry.savedAt < OWN_UNDO_MS}
                undoing={undo.isPending && undo.variables?.id === entry.id}
                onUndo={() => undoMutate(entry)}
              />
            ))}
          </ul>
        )}
        {isAdmin ? null : <p className="text-sm text-muted">{strings.record.editorsUndoWindow}</p>}
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

function RecentItem({
  entry,
  stillHere,
  canUndo,
  undoing,
  onUndo,
}: {
  entry: SavedEntry;
  /** Still in the outbox (not yet on the server), or undefined once sent. */
  stillHere: OutboxEntry | undefined;
  canUndo: boolean;
  undoing: boolean;
  onUndo: () => void;
}) {
  const amount = formatNaira(entry.body.amountKobo);
  const status = !stillHere
    ? strings.outbox.sentStatus
    : stillHere.status === "attention"
      ? `${strings.outbox.attentionStatus}: ${stillHere.problem ?? ""}`
      : strings.outbox.pendingStatus;
  return (
    <li className="ov-border flex flex-col rounded-lg border border-divider bg-surface px-4 py-3">
      <span>
        <Money kobo={entry.body.amountKobo} className="font-semibold" />{" "}
        <span className="wrap-break-word">from {entry.body.donorName}</span>
      </span>
      <span className="text-sm wrap-break-word text-muted">
        {strings.paymentModes[entry.body.paymentMode]} · {entry.who}
        {entry.body.needsReview ? ` · ${strings.donations.needsReview}` : ""}
      </span>
      <span
        className={cn(
          "text-sm wrap-break-word",
          stillHere?.status === "attention" ? "font-semibold" : "text-muted",
        )}
      >
        {status}
      </span>
      {canUndo ? (
        <Button
          variant="secondary"
          className="mt-2 self-start"
          aria-label={strings.record.undoLabel(amount, entry.body.donorName)}
          disabled={undoing}
          onClick={onUndo}
        >
          {strings.record.undo}
        </Button>
      ) : null}
    </li>
  );
}

/**
 * Always visible: online or not, how many donations are still on this phone, and a way to
 * send them now. Not a live region (the offline banner and the toasts already speak).
 */
function SyncStatus({ userId, unsent }: { userId: string; unsent: OutboxEntry[] }) {
  const online = useOnline();
  const state = useSyncState();
  const pending = unsent.filter((e) => e.status === "pending").length;
  const attention = unsent.length - pending;

  const [Icon, text] =
    state.phase === "signedOut"
      ? [TriangleAlert, strings.sync.signedOut]
      : !online
        ? [WifiOff, pending > 0 ? strings.sync.offlineSome(pending) : strings.sync.offlineNone]
        : state.phase === "syncing" && pending > 0
          ? [LoaderCircle, strings.sync.sending(pending)]
          : pending > 0
            ? [CloudUpload, strings.sync.waiting(pending)]
            : [Wifi, strings.sync.allSent];

  return (
    <div className="mt-1 flex flex-col gap-1 text-sm">
      <p
        className={cn("inline-flex items-center gap-1.5", online ? "text-muted" : "font-semibold")}
      >
        <Icon
          aria-hidden
          className={cn("size-4 shrink-0", state.phase === "syncing" && "motion-safe:animate-spin")}
        />
        {text}
      </p>
      {online && pending > 0 && state.lastError ? (
        <p className="text-muted">{strings.outbox.lastError(state.lastError)}</p>
      ) : null}
      {pending > 0 || attention > 0 ? (
        <p className="flex flex-wrap items-center gap-x-3">
          {online && pending > 0 && state.phase !== "syncing" ? (
            <Button variant="link" className="min-h-12 px-0" onClick={() => void syncNow(userId)}>
              {strings.outbox.sendNow}
            </Button>
          ) : null}
          <Link
            href="/outbox"
            className="inline-flex min-h-12 items-center font-semibold text-primary underline underline-offset-4"
          >
            {attention > 0 ? strings.outbox.attention(attention) : strings.sync.seeWaiting}
          </Link>
        </p>
      ) : null}
    </div>
  );
}
