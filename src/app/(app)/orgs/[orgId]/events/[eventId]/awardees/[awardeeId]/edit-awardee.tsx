"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useParams, useRouter } from "next/navigation";
import { BackLink, Main, PageHeading } from "@/components/app/shell";
import { PageSkeleton } from "@/components/app/route-guard";
import { QueryError } from "@/components/app/query-state";
import { Notice } from "@/components/ui/misc";
import { useToast } from "@/components/ui/toaster";
import { api, call } from "@/lib/api/client";
import { awardeesQuery, eventQuery, isNotFound, keys } from "@/lib/api/queries";
import { roleAtLeast } from "@/lib/auth/auth-provider";
import { strings } from "@/lib/strings";
import { koboToNairaInput } from "@/lib/validation";
import { useOrgRole } from "../../../../org-shell";
import { AwardeeForm } from "../../awardee-form";

/** Editing an awardee is admin only (PATCH /events/{eventId}/awardees/{id}). */
export function EditAwardee() {
  const { eventId, awardeeId } = useParams<{ eventId: string; awardeeId: string }>();
  const { orgId, role } = useOrgRole();
  const router = useRouter();
  const toast = useToast();
  const queryClient = useQueryClient();
  const event = useQuery(eventQuery(orgId, eventId));
  const awardees = useQuery(awardeesQuery(orgId, eventId));
  const eventHref = `/orgs/${orgId}/events/${eventId}`;
  const back = <BackLink href={eventHref}>{strings.awardees.backToEvent}</BackLink>;

  if (event.isPending || awardees.isPending) return <PageSkeleton />;

  const error = event.error ?? awardees.error;
  if (error) {
    return (
      <Main narrow>
        {back}
        <PageHeading>{strings.awardees.edit}</PageHeading>
        {isNotFound(error) ? (
          <Notice>{strings.errors.notFound}</Notice>
        ) : (
          <QueryError
            error={error}
            onRetry={() => {
              void event.refetch();
              void awardees.refetch();
            }}
          />
        )}
      </Main>
    );
  }

  const awardee = awardees.data?.find((a) => a.id === awardeeId);
  const blocked = !roleAtLeast(role, "ADMIN")
    ? strings.errors.forbidden
    : event.data?.closed
      ? strings.event.closedBanner
      : !awardee
        ? strings.awardees.notFound
        : null;

  return (
    <Main narrow>
      {back}
      <PageHeading intro={event.data?.name}>{strings.awardees.edit}</PageHeading>
      {blocked || !awardee ? (
        <Notice>{blocked}</Notice>
      ) : (
        <AwardeeForm
          idPrefix="edit-awardee"
          mode="update"
          defaultValues={{
            number: awardee.number === null ? "" : String(awardee.number),
            name: awardee.name,
            amount: koboToNairaInput(awardee.amountKobo),
            paymentMode: awardee.paymentMode ?? "TRANSFER",
          }}
          onClosedEvent={() =>
            void queryClient.invalidateQueries({ queryKey: keys.event(orgId, eventId) })
          }
          onSave={async (body) => {
            const saved = await call((signal) =>
              api.PATCH("/api/events/{eventId}/awardees/{id}", {
                params: { path: { eventId, id: awardeeId } },
                body,
                signal,
              }),
            );
            await Promise.all([
              queryClient.invalidateQueries({ queryKey: keys.summary(orgId, eventId) }),
              queryClient.invalidateQueries({ queryKey: keys.awardees(orgId, eventId) }),
            ]);
            toast.show({ message: strings.awardees.saved(saved.name), tone: "success" });
            router.push(eventHref);
          }}
        />
      )}
    </Main>
  );
}
