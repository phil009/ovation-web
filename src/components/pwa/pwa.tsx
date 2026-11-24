"use client";

import { SerwistProvider, useSerwist } from "@serwist/turbopack/react";
import { X } from "lucide-react";
import { useEffect, useState, useSyncExternalStore, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/toaster";
import { strings } from "@/lib/strings";

// ---- install prompt ------------------------------------------------------------------------

interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

let deferredPrompt: BeforeInstallPromptEvent | null = null;
const installListeners = new Set<() => void>();
const notifyInstall = () => installListeners.forEach((l) => l());

// Registered at module load: the event can fire before React mounts.
if (typeof window !== "undefined") {
  window.addEventListener("beforeinstallprompt", (event) => {
    event.preventDefault();
    deferredPrompt = event as BeforeInstallPromptEvent;
    notifyInstall();
  });
  window.addEventListener("appinstalled", () => {
    deferredPrompt = null;
    notifyInstall();
  });
}

function isStandalone(): boolean {
  return (
    window.matchMedia("(display-mode: standalone)").matches ||
    (navigator as Navigator & { standalone?: boolean }).standalone === true
  );
}

function isIosSafari(): boolean {
  const ua = navigator.userAgent;
  const ios =
    /iPad|iPhone|iPod/.test(ua) || (ua.includes("Macintosh") && navigator.maxTouchPoints > 1);
  return ios && /Safari/.test(ua) && !/CriOS|FxiOS|EdgiOS/.test(ua);
}

/** Install state for the Install button: can we prompt, and is the app already installed? */
export function useInstall() {
  const canPrompt = useSyncExternalStore(
    (l) => {
      installListeners.add(l);
      return () => installListeners.delete(l);
    },
    () => deferredPrompt !== null,
    () => false,
  );
  const installed = useSyncExternalStore(
    () => () => undefined,
    () => isStandalone(),
    () => false,
  );

  return {
    canPrompt,
    installed,
    async install() {
      if (!deferredPrompt) return;
      await deferredPrompt.prompt();
      await deferredPrompt.userChoice.catch(() => undefined);
      deferredPrompt = null;
      notifyInstall();
    },
  };
}

const IOS_HINT_KEY = "ovation-ios-hint-dismissed";

/** iOS Safari has no install prompt: a small dismissible hint instead. */
export function IosInstallHint() {
  const [show, setShow] = useState(false);

  useEffect(() => {
    // sessionStorage: the hint comes back next visit, which is fine for a one-line hint.
    const dismissed = sessionStorage.getItem(IOS_HINT_KEY) === "1";
    // eslint-disable-next-line react-hooks/set-state-in-effect -- browser-only detection
    setShow(!dismissed && isIosSafari() && !isStandalone());
  }, []);

  if (!show) return null;
  return (
    <div className="ov-border flex items-center gap-3 border-b border-divider bg-surface px-4 py-2 text-sm">
      <p className="flex-1">{strings.pwa.iosHint}</p>
      <Button
        variant="ghost"
        size="icon"
        aria-label={strings.pwa.iosHintDismiss}
        onClick={() => {
          sessionStorage.setItem(IOS_HINT_KEY, "1");
          setShow(false);
        }}
      >
        <X aria-hidden />
      </Button>
    </div>
  );
}

// ---- service worker ------------------------------------------------------------------------

/**
 * Registers the service worker. A new version waits until the user chooses Reload:
 * never reload on our own, because someone may be in the middle of an entry.
 */
export function PwaProvider({ children }: { children: ReactNode }) {
  return (
    <SerwistProvider
      swUrl="/serwist/sw.js"
      disable={process.env.NODE_ENV === "development"}
      reloadOnOnline={false}
      cacheOnNavigation={false}
    >
      <UpdatePrompt />
      {children}
    </SerwistProvider>
  );
}

function UpdatePrompt() {
  const { serwist } = useSerwist();
  const toast = useToast();

  useEffect(() => {
    if (!serwist) return;
    const onWaiting = () => {
      toast.show({
        message: strings.pwa.updateAvailable,
        duration: Infinity,
        action: {
          label: strings.pwa.reload,
          onClick: () => {
            serwist.addEventListener("controlling", () => window.location.reload());
            serwist.messageSkipWaiting();
          },
        },
      });
    };
    serwist.addEventListener("waiting", onWaiting);
    return () => serwist.removeEventListener("waiting", onWaiting);
  }, [serwist, toast]);

  return null;
}
