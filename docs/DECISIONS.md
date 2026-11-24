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
