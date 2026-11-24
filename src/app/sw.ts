/// <reference no-default-lib="true" />
/// <reference lib="esnext" />
/// <reference lib="webworker" />
/*
 * Ovation service worker (bundled by @serwist/turbopack, served at /serwist/sw.js).
 *
 * Precaches static build assets and the /offline page only. It never caches /api/*, any
 * cross-origin request (the API lives on another origin), or authenticated HTML.
 * Navigations go to the network; when that fails, /offline is shown.
 */
import { NetworkOnly, Serwist, type PrecacheEntry, type SerwistGlobalConfig } from "serwist";

declare global {
  interface WorkerGlobalScope extends SerwistGlobalConfig {
    __SW_MANIFEST: (PrecacheEntry | string)[] | undefined;
  }
}

declare const self: ServiceWorkerGlobalScope;

const serwist = new Serwist({
  precacheEntries: self.__SW_MANIFEST,
  // Wait for the user to press Reload (the page sends SKIP_WAITING).
  skipWaiting: false,
  clientsClaim: true,
  navigationPreload: false,
  runtimeCaching: [
    {
      // Same-origin page navigations: network only, so no HTML is ever cached at runtime.
      matcher: ({ request, sameOrigin }) => sameOrigin && request.mode === "navigate",
      handler: new NetworkOnly(),
    },
  ],
  fallbacks: {
    entries: [{ url: "/offline", matcher: ({ request }) => request.destination === "document" }],
  },
});

serwist.addEventListeners();
