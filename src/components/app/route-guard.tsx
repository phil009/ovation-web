"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, type ReactNode } from "react";
import { useSession } from "@/lib/auth/auth-provider";
import { loginUrl } from "@/lib/auth/redirect";
import { Skeleton } from "@/components/ui/misc";
import { strings } from "@/lib/strings";

/** Page-shaped placeholder while the session is restored, so protected content never flashes. */
export function PageSkeleton() {
  return (
    <div aria-busy="true" className="mx-auto flex w-full max-w-5xl flex-col gap-4 px-4 py-8">
      <span className="sr-only">{strings.app.loading}</span>
      <Skeleton className="h-10 w-2/3" />
      <Skeleton className="h-5 w-1/2" />
      <Skeleton className="h-32 w-full" />
    </div>
  );
}

/** Renders children only for a signed-in user; otherwise sends them to sign in. */
export function RouteGuard({ children }: { children: ReactNode }) {
  const { status } = useSession();
  const router = useRouter();
  const pathname = usePathname();
  const search = useSearchParams();

  useEffect(() => {
    if (status === "anonymous") {
      const query = search.toString();
      router.replace(loginUrl(query ? `${pathname}?${query}` : pathname));
    }
  }, [status, router, pathname, search]);

  if (status !== "authenticated") return <PageSkeleton />;
  return <>{children}</>;
}

/** For sign-in and register: a signed-in user goes on to `next` (validated) or home. */
export function useRedirectWhenSignedIn(next: string) {
  const { status } = useSession();
  const router = useRouter();
  useEffect(() => {
    if (status === "authenticated") router.replace(next);
  }, [status, router, next]);
  return status;
}
