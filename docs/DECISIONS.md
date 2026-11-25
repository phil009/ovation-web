# Decisions

Short records of choices that shaped the code, newest last. Each says what was chosen, why, and what it costs.

## 1. Next.js 16.4 (Turbopack), no Cache Components

The scaffold enabled `cacheComponents` (static PPR shells). Next's CSP guide says nonce-based CSP needs every page rendered per request, and PPR is incompatible with nonces. Security wins, so `cacheComponents` is off and the root layout reads `cookies()`, which makes every page dynamic.

Cost: no static HTML at the edge. The pages are thin client shells around API data, so server render time is small. If hosting cost matters later, the experimental SRI hash-based CSP (keeps static pages) is the alternative to evaluate.

## 2. Serwist via `@serwist/turbopack`

`@serwist/next` is a webpack plugin. Next 16 builds with Turbopack, so we use `@serwist/turbopack`. It bundles `src/app/sw.ts` with esbuild and serves it from a route handler (`/serwist/sw.js`). Native `esbuild` works on Windows without approving its install script (the binary ships as an optional dependency).

Serwist's `defaultCache` is **not** used. It caches cross-origin responses (our API) and HTML pages. The worker precaches `.next/static/**`, `public/**` and `/offline` only, sends navigations to the network (`NetworkOnly`), and falls back to `/offline`.

## 3. Refresh token in IndexedDB, access token in memory

The access token is kept in memory only. The refresh token goes in IndexedDB (Dexie, table `session`), because it has to survive restarts and offline starts.

Any storage JavaScript can read is exposed to XSS. A server-side proxy holding an httpOnly cookie would be stronger against XSS. It would also mean:

- a server in the path of every API call;
- cookie auth, and with it CSRF;
- an app that cannot start or authenticate offline.

That conflicts with the offline-first design (M4). We accept the XSS exposure and reduce it with a strict nonce CSP and no third-party scripts. See SECURITY.md.

## 4. Single-flight refresh across tabs

Refresh tokens are single use. If a spent token is sent again within 2 minutes (and its replacement is unused), the backend returns the same replacement, so a lost response can be retried. Later than 2 minutes, it treats the reuse as theft and ends every session of the account. So:

- Refresh runs under `navigator.locks.request('ovation-refresh')`. Where Web Locks are unavailable, it falls back to a mutex within the tab.
- Inside the lock, the stored token is read again, and the refresh is skipped if another tab already delivered a fresh access token over `BroadcastChannel`.
- The new refresh token is persisted before any caller sees the new access token.
- A refused token is checked again after 1.5 seconds before the session is declared over, in case another tab was still saving.
- No refresh is sent while the browser reports being offline.
- Before sending, the send time (`refreshSentAt`) is saved with the token in IndexedDB, so it survives reloads and is shared by tabs. Any answer from the server clears it (a new token, or a 429 or 5xx, which do not rotate).
- With no answer (network error, or the 30 second refresh timeout), the same token is retried after 5, 15 and 30 seconds, but only within 100 seconds of the first send (the backend's 2 minutes, minus margin for the retry's own trip).
- After that, the token is never sent to `/auth/refresh` again: it may be spent, and sending it could end every session on every device. Instead the app calls `/auth/logout` with it (safe, and it also revokes the replacement we never received) and asks the user to sign in again. One device signing in again is better than every device being signed out.
- Only a 401 from `/auth/refresh`, or that expired window, ends the session.
- A refresh that answers after the session ended (the user signed out while it was in flight, which happens easily right after a page load) is discarded, and its new token is revoked. Ending a session bumps a counter that every refresh checks before storing tokens. Without this, signing out a second after opening a page could leave the user signed in.

Trade-off: if the network fails while a refresh is in flight and stays down for about two minutes while the browser still reports online (for example, Wi-Fi with no internet), the user has to sign in again. Refreshes happen about every 14 minutes, so this needs bad timing. In M4, this should become a "sign in again to sync" state that keeps offline capture usable, instead of ending the session (ROADMAP.md).

## 5. Theme in a cookie

The theme preference (`ovation-theme`: system, light or dark) lives in a plain, non-sensitive cookie. The server renders the right `data-theme` on `<html>`, so there is no flash of the wrong theme and no inline script, which the CSP would block. It is not an auth cookie. Auth stays header-only.

## 6. CSP without `unsafe-inline` for styles

Production uses `style-src 'self' 'nonce-…'` with no `unsafe-inline`. Tailwind emits a stylesheet, and Radix sets positioning styles through the CSSOM (allowed), not through style attributes in server HTML. Playwright confirms zero CSP violations on every public route. Zod 4 runs with `jitless: true` because its JIT probe calls `Function("")`, which the CSP blocks and reports.

Development allows `unsafe-eval` (React error stacks), `unsafe-inline` styles (dev overlay) and `ws:` (hot reload).

## 7. Hand-written shadcn-style components

The prompt asked for shadcn/ui. The components in `src/components/ui` follow its conventions (Radix primitives, `cva`, `cn`, `components.json` is present for the CLI), but were written by hand. They build our requirements in from the start (48px targets, `aria-describedby` wiring, error summary), so the stock components would have needed rewriting anyway. The shadcn CLI can still add components later.

## 8. Fonts: Inter and Fraunces with the `vietnamese` subset

Igbo's dotted vowels (ị ọ ụ, U+1ECB, U+1ECD, U+1EE5) are in Google Fonts' `vietnamese` subset, not `latin-ext`. Without it they would render in a fallback font. Both fonts load `latin`, `latin-ext` and `vietnamese`. `next/font` downloads them at build time and serves them from our origin, so there are no Google requests at runtime. The `/dev/design` glyph test shows every weight.

## 9. Account-level query keys

The prompt says query keys start with `['org', orgId, …]`. Data that belongs to the account rather than an organisation (`/auth/me`, `/orgs`) uses `['account', …]`. On an organisation switch every `['org', otherId, …]` query is removed. On logout the whole cache is cleared.

## 10. Brand assets

The app icons are rendered from `public/icons/ovation-app-icon*.svg` by `scripts/render-icons.mjs`, using Playwright's Chromium. The header shows the colour lockup, or the reversed lockup in dark mode. Favicons come from `favicon.svg` and `favicon.ico`.

## 11. Event dates are shown in UTC

The API takes an event date as `YYYY-MM-DD` and returns it as midnight UTC (`2026-11-08T00:00:00.000Z`). It is a calendar day, not a moment, so `formatEventDate` formats it with `timeZone: "UTC"`. Local time would show the previous day to anyone west of Greenwich, including the diaspora in the US. Moments (the audit log, invite expiry, joined dates) use the viewer's own time zone. The new-event form defaults to today in the viewer's time zone.

## 12. The event page reads the summary, not the awardee list

`GET /events/{id}/summary` returns every awardee that hasn't been deleted, with number, name, payment mode and totals, so the event page needs one request instead of two. The awardee list (`GET /events/{id}/awardees`) is only used on the edit page, which needs `amountKobo` and `paymentMode` as stored. Totals are never added up in the browser.

## 13. Editing an awardee is a page, not a dialog

Edit opens `/orgs/{orgId}/events/{eventId}/awardees/{awardeeId}`. On a phone a full page has more room, works with the back button, and moves focus to its heading the same way as every other route. Adding awardees stays inline on the event page, because organisers add many in a row. After each one the form clears, keeps the payment mode, suggests the next notebook number and puts focus back on the name.

Awardee forms keep their values as strings and convert them in `awardeeBody` (tested): an empty amount or `0` leaves the amount out on create. On update it sends `"0"`, because the API has no way to unset an amount. The payment mode is sent only with an amount.

## 14. Wide tables scroll inside a focusable region

The totals and audit tables are real `<table>`s, which are too wide for a phone. They sit in `ScrollRegion`, which is `role="region"`, labelled by the table caption, `tabIndex={0}` so keyboard users can scroll it (axe: scrollable-region-focusable), and `position: relative`. That last part matters. Screen-reader-only text is absolutely positioned, and without a positioned ancestor it escapes the scroll box and widens the whole page on phones. The M2 end-to-end tests now fail if any page scrolls sideways. jsx-a11y's `no-noninteractive-tabindex` allows the `region` role for this.

## 15. Donations: per awardee or general, and who can change them

Each awardee has their own donation (on the awardee) and any number of supporter donations (`awardeeId` set). A general donation (`awardeeId: null`) is for the event as a whole. Editors and admins create donations. Only admins edit them. Admins can delete any donation; editors can delete their own within 10 minutes of creating it (backend 0.3.0). So:

- the entry screen is for editors and admins;
- Undo is in the toast (10 seconds) and on each entry under "Saved on this phone just now". For editors it shows for 10 minutes after the entry was created; the server enforces the window, and a late attempt says to ask an admin. "Check this entry later" stays for doubtful entries;
- the donations list is for every role; Edit (and Delete, on the edit page) is for admins.

## 16. A donation's client id lives as long as the entry, and a changed retry is caught

(M3. Since M4 the id is made when an entry is saved to the outbox and never changes, so a changed retry can't happen and the comparison below is gone.) The entry form made a `crypto.randomUUID()` when it opened and keeps it, in the IndexedDB draft too, until the server confirms the save. A retry, even after a reload, is the same donation, and the backend's idempotent create can't save it twice.

The catch: if the response was lost and the user changed the form before retrying, the backend returns the first version unchanged. So after every save the app compares what it sent with what came back (`sameDonation`). If they differ, it says the earlier version was saved, keeps the new values, and gives them a new id, so saving again adds them as a separate donation. Nothing is silently dropped or doubled.

Drafts (`drafts` table, one per event) are restored only for the same user, and cleared on a deliberate sign-out because they hold donor names. A session that expires keeps them.

## 17. The entry screen was online only in M3, but already shaped for M4

(Superseded by items 19 and 20.)

Saving needs the network. Offline, Save does not send anything; it says the entry was not saved and that what was typed is kept (the draft). The sticky bar shows a sync status that M4 will fill with pending counts, so the layout won't change.

Donor names come from `GET /events/{id}/donor-names` (every distinct name at the event), through a native `datalist`, which uses the phone's own suggestion UI and needs no custom combobox. Totals in the sticky bar come from the summary endpoint, refreshed after each save, never added up in the browser.

## 18. Donation edits and stale versions

Editing sends the `version` that was read. A 409 that isn't about a closed event means someone saved first. The form says so, disables Save, and offers "Load the latest version", which reloads the donation into a fresh form. The user then makes their change again. We don't merge automatically: two people correcting the same entry at once is rare, and a silent merge of money is worse than asking.

Status only shows for pledges ("Has this pledge been paid?"). Cash and transfers are always saved as received.

## 19. Offline: the outbox is the save

Saving a donation means writing it to the IndexedDB outbox; the sync engine sends it. The entry screen behaves the same with or without a connection, and the server only ever sees each client id once (or as a duplicate, which counts as done).

The engine sends one event per batch, so one closed event can't hold back the rest. Refusals (closed event, 403, 404, a 400 that survives splitting) mark entries "needs attention" with a plain reason; the user fixes the cause (an admin reopens the event) and presses Try again, or downloads a copy and deletes. Connection problems never mark anything: they retry. Undo runs inside the same lock as sending, so an entry can't be undone locally while it is on its way.

Cost: a donation saved online reaches the server a moment after the "Saved" toast. The status bar says "Sending…" and then "All donations sent".

## 20. Offline start: entry kits and one cached page

To open the entry screen with no signal, two things are stored that earlier milestones avoided:

- **Entry kits** (IndexedDB `kits`): per event, its name, closed flag, your role, and the awardee list with last known totals, written whenever the entry screen loads online. Offline, the screen uses the kit and says when it was saved. It is a small, purpose-built snapshot, not a cache of API responses, and totals shown from it are labelled as possibly out of date.
- **The entry screen's HTML** in the service worker (cache `ovation-entry-pages`, network first with a 6-second timeout). It is a client shell with no organisation data. A new build deletes the cache, so old HTML never refers to scripts the new build removed. All other pages stay network only.

TanStack Query is told the browser's online state at start (`onlineManager.setOnline(navigator.onLine)`). Otherwise it assumes "online", and an offline start loops: each retry put the organisation page back on its skeleton, which remounted the entry screen, which refetched. Pages treat a query with no data whose last failure was a connection error as unreachable (`isUnreachable`), which also covers Wi-Fi with no internet.

Kits and drafts are cleared on sign-out. The outbox is not (item 21).

**Session end:** the plan was to keep the entry screen usable after a session ends with unsent entries. A session can only end with a server answer (a 401, or the refresh replay window passing while online), so the phone is online at that moment and signing in is possible. The app sends the user to sign in; the outbox is untouched, and the login page says how many donations are waiting. Entries are sent only with the account that recorded them.

## 21. Signing out never deletes unsent donations

Signing out (menu, settings, or all devices) with unsent donations first shows a warning with a CSV copy. Either way, the entries stay on the phone and are sent when the same account signs in again; another account on the same phone sees only a count. Deleting is a separate, confirmed action on the Waiting to send page, for refused entries. Losing a record of money is worse than leaving names on a phone the organiser already holds.
