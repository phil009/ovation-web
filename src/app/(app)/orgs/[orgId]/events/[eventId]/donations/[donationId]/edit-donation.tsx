"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Trash2 } from "lucide-react";
import { useParams, useRouter } from "next/navigation";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { QueryError } from "@/components/app/query-state";
import { PageSkeleton } from "@/components/app/route-guard";
import { BackLink, Main, PageHeading } from "@/components/app/shell";
import { summaryItems, useSubmitErrors } from "@/components/forms/form-kit";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { ErrorSummary } from "@/components/ui/error-summary";
import { Notice } from "@/components/ui/misc";
import { useToast } from "@/components/ui/toaster";
import { api, call } from "@/lib/api/client";
import { isApiError } from "@/lib/api/errors";
import {
  donationQuery,
  eventQuery,
  isClosedEventConflict,
  isNotFound,
  keys,
  summaryQuery,
  type DonationDto,
  type EventSummary,
} from "@/lib/api/queries";
import { roleAtLeast } from "@/lib/auth/auth-provider";
import { strings } from "@/lib/strings";
import {
  donationSchema,
  donationToValues,
  donationUpdateBody,
  type DonationValues,
} from "@/lib/validation";
import { useOrgRole } from "../../../../org-shell";
import {
  DonationExtras,
  DonationFields,
  awardeeOptions,
  donationFieldIds,
} from "../../donation-fields";

/** Editing and deleting a donation are admin only (PATCH and DELETE /donations/{id}). */
export function EditDonation() {
  const { eventId, donationId } = useParams<{ eventId: string; donationId: string }>();
  const { orgId, role } = useOrgRole();
  const event = useQuery(eventQuery(orgId, eventId));
  const summary = useQuery(summaryQuery(orgId, eventId));
  const donation = useQuery(donationQuery(orgId, donationId));
  const listHref = `/orgs/${orgId}/events/${eventId}/donations`;
  const back = <BackLink href={listHref}>{strings.donations.backToList}</BackLink>;

  if (event.isPending || summary.isPending || donation.isPending) return <PageSkeleton />;

  const error = event.error ?? summary.error ?? donation.error;
  // A donation from another event (or organisation) is "not found" under this URL.
  const wrongEvent = donation.data !== undefined && donation.data.eventId !== eventId;
  if (error || wrongEvent || !event.data || !summary.data || !donation.data) {
    return (
      <Main narrow>
        {back}
        <PageHeading>{strings.donations.edit}</PageHeading>
        {wrongEvent || isNotFound(error) ? (
          <Notice>{strings.donations.notFound}</Notice>
        ) : (
          <QueryError
            error={error}
            onRetry={() => {
              void event.refetch();
              void summary.refetch();
              void donation.refetch();
            }}
          />
        )}
      </Main>
    );
  }

  const blocked = !roleAtLeast(role, "ADMIN")
    ? strings.errors.forbidden
    : event.data.closed
      ? strings.event.closedBanner
      : null;

  return (
    <Main narrow>
      {back}
      <PageHeading intro={event.data.name}>{strings.donations.edit}</PageHeading>
      {blocked ? (
        <Notice>
          <p>{blocked}</p>
        </Notice>
      ) : (
        // A new version (after "Load the latest version") starts a fresh form.
        <EditForm
          key={`${donation.data.id}:${donation.data.version}`}
          donation={donation.data}
          summary={summary.data}
          listHref={listHref}
          onReload={() => void donation.refetch()}
        />
      )}
    </Main>
  );
}

function EditForm({
  donation,
  summary,
  listHref,
  onReload,
}: {
  donation: DonationDto;
  summary: EventSummary;
  listHref: string;
  onReload: () => void;
}) {
  const { orgId } = useOrgRole();
  const router = useRouter();
  const toast = useToast();
  const queryClient = useQueryClient();
  const ids = donationFieldIds("edit-donation");
  const [stale, setStale] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const form = useForm<DonationValues>({
    resolver: zodResolver(donationSchema),
    defaultValues: donationToValues(donation),
    shouldFocusError: false,
  });
  const { formError, focusKey, fail, onInvalid, coolingDown } = useSubmitErrors(form);
  const { errors, isSubmitting } = form.formState;

  const refreshLists = () =>
    Promise.all([
      queryClient.invalidateQueries({ queryKey: keys.summary(orgId, donation.eventId) }),
      queryClient.invalidateQueries({ queryKey: keys.donations(orgId, donation.eventId) }),
    ]);

  const onClosed = () =>
    void queryClient.invalidateQueries({ queryKey: keys.event(orgId, donation.eventId) });

  const onSubmit = form.handleSubmit(async (values) => {
    try {
      const saved = await call((signal) =>
        api.PATCH("/api/donations/{id}", {
          params: { path: { id: donation.id } },
          body: donationUpdateBody(values, donation.version),
          signal,
        }),
      );
      queryClient.setQueryData(keys.donation(orgId, donation.id), saved);
      await refreshLists();
      toast.show({ message: strings.donations.savedToast, tone: "success" });
      router.push(listHref);
    } catch (error) {
      const closed = isClosedEventConflict(error);
      if (closed) onClosed();
      // Any other 409 is a stale version: someone saved first.
      const isStale = !closed && isApiError(error) && error.status === 409;
      setStale(isStale);
      fail(error, {
        409: closed ? strings.event.closedConflict : strings.donations.stale,
      });
    }
  }, onInvalid);

  const remove = useMutation({
    mutationFn: () =>
      call((signal) =>
        api.DELETE("/api/donations/{id}", { params: { path: { id: donation.id } }, signal }),
      ),
    onSuccess: async () => {
      queryClient.removeQueries({ queryKey: keys.donation(orgId, donation.id) });
      await refreshLists();
      toast.show({ message: strings.donations.deleted, tone: "success" });
      router.push(listHref);
    },
    onError: (e) => {
      if (isClosedEventConflict(e)) onClosed();
      setDeleteError(
        isClosedEventConflict(e)
          ? strings.event.closedConflict
          : isApiError(e)
            ? e.message
            : strings.errors.unexpected,
      );
    },
  });

  return (
    <div className="flex flex-col gap-6">
      <ErrorSummary items={summaryItems(errors, ids, formError)} focusKey={focusKey} />
      {stale ? (
        <Button variant="secondary" className="self-start" onClick={onReload}>
          {strings.donations.reload}
        </Button>
      ) : null}
      <form noValidate onSubmit={onSubmit} className="flex flex-col gap-5">
        <DonationFields
          form={form}
          ids={ids}
          options={awardeeOptions(summary.awardees)}
          withStatus
        />
        <DonationExtras form={form} ids={ids} />
        <Button type="submit" size="wide" disabled={isSubmitting || coolingDown || stale}>
          {isSubmitting ? strings.donations.saving : strings.donations.save}
        </Button>
      </form>

      <div className="mt-6 flex flex-col gap-3 border-t border-divider pt-6">
        {deleteError ? (
          <Notice tone="error" live="assertive">
            <p>{deleteError}</p>
          </Notice>
        ) : null}
        <ConfirmDialog
          trigger={
            <Button variant="secondary" className="self-start" disabled={remove.isPending}>
              <Trash2 aria-hidden />
              {remove.isPending ? strings.form.wait : strings.donations.delete}
            </Button>
          }
          title={strings.donations.deleteTitle}
          description={strings.donations.deleteBody}
          confirmLabel={strings.donations.delete}
          cancelLabel={strings.org.cancel}
          destructive
          onConfirm={() => remove.mutate()}
        />
      </div>
    </div>
  );
}
