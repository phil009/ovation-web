"use client";

import { WifiOff } from "lucide-react";
import { useSyncExternalStore } from "react";
import { strings } from "@/lib/strings";

function subscribe(listener: () => void) {
  window.addEventListener("online", listener);
  window.addEventListener("offline", listener);
  return () => {
    window.removeEventListener("online", listener);
    window.removeEventListener("offline", listener);
  };
}

export function useOnline(): boolean {
  return useSyncExternalStore(
    subscribe,
    () => navigator.onLine,
    () => true,
  );
}

export function OfflineBanner() {
  const online = useOnline();
  return (
    <div role="status" aria-live="polite">
      {online ? null : (
        <p className="flex items-center justify-center gap-2 bg-accent px-4 py-2 text-center font-semibold text-on-accent">
          <WifiOff aria-hidden className="size-5 shrink-0" />
          {strings.offline.banner}
        </p>
      )}
    </div>
  );
}
