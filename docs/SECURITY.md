# Security

Ovation records money for real organisations. Trust is the product. This page is the frontend threat model and the risks we accept.

## What we protect

- **Sessions:** refresh tokens (7 days) and access tokens (15 minutes).
- **Organisation data:** donor names, amounts and members. The API enforces access; the frontend must never leak data between organisations or users. Since M4 some of it lives on the phone: unsent donations (the outbox), the half-typed donation (drafts), and per event the awardee list with last known totals (entry kits).
- **The device:** phones get shared, lost and passed around at events.

## Threats and controls

| Threat                                    | Controls                                                                                                                                                                                                                                                                                                                                                           |
| ----------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **Token theft through XSS**               | Strict CSP with a per-request nonce and `'strict-dynamic'`, no `unsafe-inline` or `unsafe-eval` in production; no third-party scripts, CDNs or analytics; `react/no-danger` and `no-eval` are lint errors; names are rendered as text, never HTML; the access token is held in memory only.                                                                        |
| **Token leakage**                         | Tokens never go in localStorage (lint rule), URLs, logs or error messages; `console.log` is stripped from production builds; the service worker never caches `/api/*` or any cross-origin response. The only HTML it caches is the entry screen, which holds no organisation data.                                                                                 |
| **Refresh token reuse (theft detection)** | Single-flight refresh across tabs (Web Locks), the stored token is read again inside the lock, and the new token is persisted before use (DECISIONS.md, item 4). Reuse would end every session of the account.                                                                                                                                                     |
| **Shared or lost phone**                  | Sign out clears memory, the session, drafts, entry kits and the query cache, and calls `/auth/logout`. Unsent donations are kept (losing money records is worse), behind a warning that offers a CSV copy; they are only ever sent with the account that recorded them. "Sign out of all devices" calls `/auth/logout-all`. A password change ends other sessions. |
| **Clickjacking**                          | `frame-ancestors 'none'` and `X-Frame-Options: DENY`.                                                                                                                                                                                                                                                                                                              |
| **Open redirect**                         | `next` must be a same-origin path starting with exactly one `/`. Backslashes, control characters, `//` and schemes are rejected (`redirect.ts`, with tests).                                                                                                                                                                                                       |
| **CSRF**                                  | No cookie auth. The API uses an `Authorization` header, so there is nothing to forge. The theme cookie carries no authority.                                                                                                                                                                                                                                       |
| **Supply chain**                          | Lockfile committed; `pnpm install --frozen-lockfile` in CI; `pnpm audit --prod --audit-level=high` in CI; install scripts blocked by default (pnpm 10), with none approved; Dependabot weekly.                                                                                                                                                                     |
| **CSV injection**                         | The unsent-donations CSV prefixes any cell starting with `=`, `+`, `-`, `@`, tab or return with an apostrophe, so a donor name cannot run as a spreadsheet formula (`export.test.ts`).                                                                                                                                                                             |
| **Invite-code guessing**                  | The backend rate-limits invite routes (10 a minute per caller) and codes expire. The UI respects 429 by disabling submit for a minute.                                                                                                                                                                                                                             |
| **Rate-limit abuse**                      | Submit is disabled while a request is pending and for 60 seconds after a 429.                                                                                                                                                                                                                                                                                      |

Other headers: `nosniff`, `Referrer-Policy: strict-origin-when-cross-origin`, a Permissions-Policy that denies camera, microphone, geolocation, payment and USB, `Cross-Origin-Opener-Policy: same-origin`, and HSTS in production.

## Residual risks we accept

1. **XSS would expose the refresh token.** IndexedDB is readable by any script on our origin. An httpOnly-cookie proxy would avoid this but breaks offline use (DECISIONS.md, item 3). The mitigation is the strict CSP.
2. **Without Web Locks** (very old browsers), two tabs could refresh at once. The backend now gives both the same replacement, so this is safe.
3. **A lost refresh response.** The backend returns the same replacement for 2 minutes. The app retries only within 100 seconds of the first send, and the send time is saved, so a reload cannot resend it later. After that, the user signs in again instead (DECISIONS.md, item 4). The cost is an occasional extra sign-in on a bad network.
4. **An access token outlives logout by up to 15 minutes.** That is the backend design.
5. **The device itself.** Someone who unlocks a phone with an active session can use Ovation. Sign out and "sign out of all devices" are the remedy.
6. **Cached HTML reuses one nonce.** The precached `/offline` page and the cached entry screens carry the nonce of the response they were saved from, with the matching CSP header. They render no organisation data (that comes from the API or IndexedDB at runtime), and a new build empties the entry-page cache.
7. **Donor and awardee names on the phone.** Unsent donations, drafts and entry kits are in IndexedDB, readable by anyone who can use the unlocked phone, or by XSS. Drafts and kits are cleared on sign-out; unsent donations stay until sent (or deleted on the "Waiting to send" page). The CSV copy is a file the user chooses to save.

## Rules for contributors

- No `dangerouslySetInnerHTML`, `eval`, `new Function`, inline event handlers or inline `<script>` tags.
- No third-party scripts, fonts or CDNs.
- No tokens, donor names or emails in `console.*`, query strings or error reports.
- Call the API only through `src/lib/api/client.ts`. Never write raw `fetch` calls to it.
- Do not add cookie auth without a design discussion (it brings CSRF).
- Only `NEXT_PUBLIC_API_URL` may be public. There are no secrets in the frontend.
