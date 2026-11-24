import type { ReactNode } from "react";
import { Suspense } from "react";
import { AppHeader } from "@/components/app/shell";
import { PageSkeleton, RouteGuard } from "@/components/app/route-guard";

export default function AppLayout({ children }: { children: ReactNode }) {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <RouteGuard>
        <AppHeader />
        {children}
      </RouteGuard>
    </Suspense>
  );
}
