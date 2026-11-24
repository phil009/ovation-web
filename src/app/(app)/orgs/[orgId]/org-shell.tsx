"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { useParams, usePathname } from "next/navigation";
import { useEffect, type ReactNode } from "react";
import { LinkButton, Main, PageHeading } from "@/components/app/shell";
import { PageSkeleton } from "@/components/app/route-guard";
import { Button } from "@/components/ui/button";
import { Notice } from "@/components/ui/misc";
import { api, call } from "@/lib/api/client";
import { isApiError } from "@/lib/api/errors";
import { ACTIVE_ORG_PREF, roleAtLeast, useRole, type Role } from "@/lib/auth/auth-provider";
import { setPref } from "@/lib/db";
import { strings } from "@/lib/strings";
import { cn } from "@/lib/utils";

export const orgQueryKey = (orgId: string) => ["org", orgId, "detail"] as const;

export function useOrg(orgId: string) {
  return useQuery({
    queryKey: orgQueryKey(orgId),
    queryFn: () =>
      call((signal) => api.GET("/api/orgs/{orgId}", { params: { path: { orgId } }, signal })),
  });
}

const tabs: { href: string; label: string; minRole: Role }[] = [
  { href: "", label: strings.org.events, minRole: "VIEWER" },
  { href: "/members", label: strings.org.members, minRole: "ADMIN" },
  { href: "/invites", label: strings.org.invites, minRole: "ADMIN" },
  { href: "/audit", label: strings.org.audit, minRole: "ADMIN" },
];

export function OrgShell({ children }: { children: ReactNode }) {
  const { orgId } = useParams<{ orgId: string }>();
  const pathname = usePathname();
  const queryClient = useQueryClient();
  const org = useOrg(orgId);
  const role = useRole(orgId) ?? org.data?.myRole;

  // Switching organisation: forget every other organisation's cached data, remember this one.
  useEffect(() => {
    queryClient.removeQueries({
      predicate: (q) => q.queryKey[0] === "org" && q.queryKey[1] !== orgId,
    });
    if (org.data) void setPref(ACTIVE_ORG_PREF, orgId).catch(() => undefined);
  }, [orgId, org.data, queryClient]);

  if (org.isPending) return <PageSkeleton />;

  if (org.isError) {
    const notFound =
      isApiError(org.error) && (org.error.status === 404 || org.error.status === 400);
    return (
      <Main>
        <PageHeading>{notFound ? strings.notFound.title : strings.errors.summaryTitle}</PageHeading>
        <Notice tone={notFound ? "info" : "error"}>
          <p>
            {notFound
              ? strings.errors.notFound
              : isApiError(org.error)
                ? org.error.message
                : strings.errors.unexpected}
          </p>
        </Notice>
        <div className="mt-6 flex flex-wrap gap-3">
          <LinkButton href="/orgs">{strings.notFound.home}</LinkButton>
          {notFound ? null : (
            <Button variant="secondary" onClick={() => void org.refetch()}>
              {strings.coldStart.retry}
            </Button>
          )}
        </div>
      </Main>
    );
  }

  const base = `/orgs/${orgId}`;
  const visibleTabs = tabs.filter((t) => roleAtLeast(role, t.minRole));

  return (
    <>
      {visibleTabs.length > 1 ? (
        <nav aria-label={strings.org.nav} className="ov-border border-b border-divider bg-surface">
          <ul className="mx-auto flex max-w-5xl flex-wrap gap-2 px-4 py-2">
            {visibleTabs.map((tab) => {
              const href = base + tab.href;
              const current =
                tab.href === ""
                  ? pathname === base || pathname.startsWith(`${base}/events`)
                  : pathname.startsWith(href);
              return (
                <li key={tab.href}>
                  <Link
                    href={href}
                    aria-current={current ? "page" : undefined}
                    className={cn(
                      "inline-flex min-h-12 items-center rounded-lg px-4 font-semibold",
                      current
                        ? "bg-primary text-on-primary"
                        : "text-primary underline-offset-4 hover:underline",
                    )}
                  >
                    {tab.label}
                  </Link>
                </li>
              );
            })}
          </ul>
        </nav>
      ) : null}
      {children}
    </>
  );
}

/** Wraps admin-only pages. The API still enforces this; the UI just explains. */
export function AdminOnly({ title, children }: { title: string; children: ReactNode }) {
  const { orgId } = useParams<{ orgId: string }>();
  const org = useOrg(orgId);
  const role = useRole(orgId) ?? org.data?.myRole;

  if (!roleAtLeast(role, "ADMIN")) {
    return (
      <Main>
        <PageHeading>{title}</PageHeading>
        <Notice>{strings.org.adminOnly}</Notice>
      </Main>
    );
  }
  return <>{children}</>;
}

export function OrgName() {
  const { orgId } = useParams<{ orgId: string }>();
  const org = useOrg(orgId);
  return <>{org.data?.name ?? ""}</>;
}
