import type { ReactNode } from "react";
import { Suspense } from "react";
import { AppHeader } from "@/components/app/shell";
import { PageSkeleton, RouteGuard } from "@/components/app/route-guard";
import { SyncProvider } from "@/components/app/sync-provider";

export default function AppLayout({ children }: { children: ReactNode }) {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <RouteGuard>
        <SyncProvider>
          <AppHeader />
          {children}
        </SyncProvider>
      </RouteGuard>
    </Suspense>
  );
}
