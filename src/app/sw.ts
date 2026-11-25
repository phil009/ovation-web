/// <reference no-default-lib="true" />
/// <reference lib="esnext" />
/// <reference lib="webworker" />
/*
 * Ovation service worker (bundled by @serwist/turbopack, served at /serwist/sw.js).
 *
 * - Precaches static build assets and the /offline page.
 * - Never caches /api/* or any cross-origin request (the API lives on another origin).
 * - Caches one kind of HTML: the entry screen (/orgs/{orgId}/events/{eventId}/record), so
 *   donations can be recorded when the app is opened with no signal. Those pages are client
 *   shells: the HTML holds no organisation data (that comes from the API, and offline from
 *   IndexedDB). Network first, so online users always get the current page.
 * - Every other navigation goes to the network; when that fails, /offline is shown.
 * - A new worker (a new build) empties the page cache, so old HTML never points at script
 *   files the new build no longer has.
 */
import {
  CacheableResponsePlugin,
  ExpirationPlugin,
  NetworkFirst,
  NetworkOnly,
  Serwist,
  type PrecacheEntry,
  type SerwistGlobalConfig,
} from "serwist";

declare global {
  interface WorkerGlobalScope extends SerwistGlobalConfig {
    __SW_MANIFEST: (PrecacheEntry | string)[] | undefined;
  }
}

declare const self: ServiceWorkerGlobalScope;

const ENTRY_PAGES = "ovation-entry-pages";
const ENTRY_PATH = /^\/orgs\/[^/]+\/events\/[^/]+\/record\/?$/;

const serwist = new Serwist({
  precacheEntries: self.__SW_MANIFEST,
  // Wait for the user to press Reload (the page sends SKIP_WAITING).
  skipWaiting: false,
  clientsClaim: true,
  navigationPreload: false,
  runtimeCaching: [
    {
      // The entry screen: network first, then the copy from the last online visit.
      matcher: ({ request, sameOrigin, url }) =>
        sameOrigin && request.mode === "navigate" && ENTRY_PATH.test(url.pathname),
      handler: new NetworkFirst({
        cacheName: ENTRY_PAGES,
        // A hall with one bar of signal: don't keep the organiser waiting longer than this.
        networkTimeoutSeconds: 6,
        plugins: [
          new CacheableResponsePlugin({ statuses: [200] }),
          new ExpirationPlugin({ maxEntries: 30, maxAgeSeconds: 30 * 24 * 60 * 60 }),
        ],
      }),
    },
    {
      // Every other page: network only, so no other HTML is cached.
      matcher: ({ request, sameOrigin }) => sameOrigin && request.mode === "navigate",
      handler: new NetworkOnly(),
    },
  ],
  fallbacks: {
    entries: [{ url: "/offline", matcher: ({ request }) => request.destination === "document" }],
  },
});

// A new build: drop entry pages saved by the old one (their script names no longer exist).
self.addEventListener("activate", (event) => {
  event.waitUntil(caches.delete(ENTRY_PAGES));
});

serwist.addEventListeners();
