"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { PageSkeleton } from "@/components/app/route-guard";
import { getPref } from "@/lib/db";
import { ACTIVE_ORG_PREF, useSession } from "@/lib/auth/auth-provider";

/** "/" goes to the last used organisation if the user still belongs to it, else to /orgs. */
export function HomeRedirect() {
  const router = useRouter();
  const { memberships, meError } = useSession();

  useEffect(() => {
    if (!memberships && !meError) return;
    let cancelled = false;
    void getPref(ACTIVE_ORG_PREF)
      .catch(() => undefined)
      .then((orgId) => {
        if (cancelled) return;
        const stillMember = orgId && memberships?.some((m) => m.organization.id === orgId);
        router.replace(stillMember ? `/orgs/${orgId}` : "/orgs");
      });
    return () => {
      cancelled = true;
    };
  }, [memberships, meError, router]);

  return <PageSkeleton />;
}
