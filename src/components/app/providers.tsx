"use client";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useState, type ReactNode } from "react";
import { isApiError } from "@/lib/api/errors";
import { EventNotInOrgError } from "@/lib/api/queries";
import { AuthProvider } from "@/lib/auth/auth-provider";
import { LiveRegionProvider } from "@/components/ui/live-region";
import { ToastProvider } from "@/components/ui/toaster";
import { PwaProvider } from "@/components/pwa/pwa";
import { HealthProvider } from "./cold-start";
import { RouteFocus } from "./route-focus";

function makeQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: {
        // Reads are idempotent: retry connection and server problems, never 4xx.
        retry: (failureCount, error) =>
          failureCount < 2 &&
          !(error instanceof EventNotInOrgError) &&
          (!isApiError(error) || error.retriable),
        refetchOnWindowFocus: true,
        networkMode: "online",
      },
      mutations: {
        // Writes are not retried automatically. Donations with a client id may opt in (M3).
        retry: false,
        networkMode: "online",
      },
    },
  });
}

export function Providers({ children }: { children: ReactNode }) {
  const [queryClient] = useState(makeQueryClient);

  return (
    <QueryClientProvider client={queryClient}>
      <LiveRegionProvider>
        <ToastProvider>
          <HealthProvider>
            <AuthProvider>
              <PwaProvider>
                <RouteFocus />
                {children}
              </PwaProvider>
            </AuthProvider>
          </HealthProvider>
        </ToastProvider>
      </LiveRegionProvider>
    </QueryClientProvider>
  );
}
