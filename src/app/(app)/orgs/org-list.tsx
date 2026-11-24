"use client";

import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { ChevronRight, Plus, Ticket } from "lucide-react";
import { LinkButton, PageHeading } from "@/components/app/shell";
import { Button } from "@/components/ui/button";
import { Card, Notice, Skeleton } from "@/components/ui/misc";
import { api, call } from "@/lib/api/client";
import { isApiError } from "@/lib/api/errors";
import { strings } from "@/lib/strings";

export const orgsQueryKey = ["account", "orgs"] as const;

export function OrgList() {
  const orgs = useQuery({
    queryKey: orgsQueryKey,
    queryFn: () => call((signal) => api.GET("/api/orgs", { signal })),
  });

  return (
    <>
      <PageHeading intro={strings.orgs.intro}>{strings.orgs.title}</PageHeading>
      <div className="mb-6 flex flex-wrap gap-3">
        <LinkButton href="/orgs/new">
          <Plus aria-hidden />
          {strings.orgs.create}
        </LinkButton>
        <LinkButton href="/join" variant="secondary">
          <Ticket aria-hidden />
          {strings.orgs.join}
        </LinkButton>
      </div>

      {orgs.isPending ? (
        <div aria-busy="true" className="flex flex-col gap-3">
          <span className="sr-only">{strings.app.loading}</span>
          <Skeleton className="h-20" />
          <Skeleton className="h-20" />
        </div>
      ) : orgs.isError ? (
        <Notice tone="error" live="assertive">
          <div className="flex flex-wrap items-center gap-3">
            <p className="flex-1">
              {isApiError(orgs.error) ? orgs.error.message : strings.errors.unexpected}
            </p>
            <Button variant="secondary" onClick={() => void orgs.refetch()}>
              {strings.coldStart.retry}
            </Button>
          </div>
        </Notice>
      ) : orgs.data.length === 0 ? (
        <Card>
          <p className="text-lg font-semibold">{strings.orgs.empty}</p>
          <p className="text-muted">{strings.orgs.emptyHint}</p>
        </Card>
      ) : (
        <ul className="flex flex-col gap-3">
          {orgs.data.map((org) => (
            <li key={org.id}>
              <Link
                href={`/orgs/${org.id}`}
                className="ov-border flex min-h-16 items-center gap-4 rounded-xl border border-divider bg-surface p-4 hover:border-border"
              >
                <span className="flex min-w-0 flex-1 flex-col">
                  <span className="truncate text-lg font-semibold">{org.name}</span>
                  <span className="text-muted">
                    {strings.orgs.role}: {strings.roles[org.myRole]}
                  </span>
                </span>
                <ChevronRight aria-hidden className="size-6 shrink-0 text-muted" />
              </Link>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
