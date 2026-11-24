"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CalendarDays, ChevronRight, Lock, LogOut, Plus } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { LinkButton, Main, PageHeading } from "@/components/app/shell";
import { ListSkeleton, QueryError, Section } from "@/components/app/query-state";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { Card, Notice } from "@/components/ui/misc";
import { useToast } from "@/components/ui/toaster";
import { api, call } from "@/lib/api/client";
import { isApiError } from "@/lib/api/errors";
import { eventsQuery } from "@/lib/api/queries";
import { ACTIVE_ORG_PREF, meQueryKey, roleAtLeast, useSession } from "@/lib/auth/auth-provider";
import { formatEventDate } from "@/lib/dates";
import { deletePref } from "@/lib/db";
import { strings } from "@/lib/strings";
import { orgsQueryKey } from "../org-list";
import { OrgName, useOrg, useOrgRole } from "./org-shell";

export function EventsView() {
  const { orgId, role } = useOrgRole();
  const events = useQuery(eventsQuery(orgId));
  const canCreate = roleAtLeast(role, "EDITOR");

  return (
    <Main>
      <PageHeading intro={<OrgName />}>{strings.org.events}</PageHeading>
      <p className="mb-4 text-muted">{strings.events.intro}</p>
      {canCreate ? (
        <LinkButton href={`/orgs/${orgId}/events/new`} className="mb-6">
          <Plus aria-hidden />
          {strings.events.new}
        </LinkButton>
      ) : null}

      <div>
        {events.isPending ? (
          <ListSkeleton />
        ) : events.isError ? (
          <QueryError error={events.error} onRetry={() => void events.refetch()} />
        ) : events.data.length === 0 ? (
          <Card>
            <p className="text-lg font-semibold">{strings.events.empty}</p>
            <p className="text-muted">
              {canCreate ? strings.events.emptyEditor : strings.events.emptyViewer}
            </p>
          </Card>
        ) : (
          <ul className="flex flex-col gap-3">
            {events.data.map((event) => (
              <li key={event.id}>
                <Link
                  href={`/orgs/${orgId}/events/${event.id}`}
                  className="ov-border flex min-h-16 items-center gap-4 rounded-xl border border-divider bg-surface p-4 hover:border-border"
                >
                  <span className="flex min-w-0 flex-1 flex-col gap-1">
                    <span className="text-lg font-semibold wrap-break-word">{event.name}</span>
                    <span className="flex flex-wrap items-center gap-x-3 gap-y-1 text-muted">
                      <span className="inline-flex items-center gap-1.5">
                        <CalendarDays aria-hidden className="size-4" />
                        {formatEventDate(event.date)}
                      </span>
                      {event.closed ? <ClosedBadge /> : null}
                    </span>
                  </span>
                  <ChevronRight aria-hidden className="size-6 shrink-0 text-muted" />
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>

      <Membership />
    </Main>
  );
}

/** "Closed" with a lock icon, never colour alone. */
export function ClosedBadge() {
  return (
    <span className="ov-border inline-flex items-center gap-1 rounded-full border border-border px-2.5 py-0.5 text-sm font-semibold text-text">
      <Lock aria-hidden className="size-4" />
      {strings.events.closed}
    </span>
  );
}

/** Your role here, and leaving (any role may leave; the last admin gets a 409). */
function Membership() {
  const { orgId, role } = useOrgRole();
  const org = useOrg(orgId);
  const { user } = useSession();
  const router = useRouter();
  const toast = useToast();
  const queryClient = useQueryClient();
  const [error, setError] = useState<string | null>(null);
  const orgName = org.data?.name ?? "";

  const leave = useMutation({
    mutationFn: () =>
      call((signal) =>
        api.DELETE("/api/orgs/{orgId}/members/{userId}", {
          params: { path: { orgId, userId: user!.id } },
          signal,
        }),
      ),
    onSuccess: async () => {
      await deletePref(ACTIVE_ORG_PREF).catch(() => undefined);
      // The cached data of this organisation is memory only. It is dropped when another
      // organisation opens (OrgShell) or after the cache's garbage-collection time. Removing it
      // here, while this page is still mounted, would refetch it and flash "not found".
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: meQueryKey }),
        queryClient.invalidateQueries({ queryKey: orgsQueryKey }),
      ]);
      toast.show({ message: strings.org.left(orgName), tone: "success" });
      router.replace("/orgs");
    },
    onError: (e) =>
      setError(
        isApiError(e) && e.status === 409
          ? strings.org.lastAdmin
          : isApiError(e)
            ? e.message
            : strings.errors.unexpected,
      ),
  });

  if (!role || !user) return null;

  return (
    <Section id="membership-heading" title={strings.org.membership}>
      <p>{strings.org.yourRole(strings.roles[role])}</p>
      <p className="text-muted">{strings.roleCan[role]}</p>
      {error ? (
        <Notice tone="error" live="assertive">
          <p>{error}</p>
        </Notice>
      ) : null}
      <ConfirmDialog
        trigger={
          <Button variant="secondary" className="self-start" disabled={leave.isPending}>
            <LogOut aria-hidden />
            {leave.isPending ? strings.org.leaving : strings.org.leave}
          </Button>
        }
        title={strings.org.leaveTitle}
        description={strings.org.leaveBody(orgName)}
        confirmLabel={strings.org.leaveConfirm}
        cancelLabel={strings.org.cancel}
        destructive
        onConfirm={() => {
          setError(null);
          leave.mutate();
        }}
      />
    </Section>
  );
}
