# Roadmap

M0 (foundation), M1 (auth and organisations), M2 (events, awardees, totals and admin screens) and M3 (donations) are built. This is the plan for the rest. Each milestone ships behind the same rules: SDK types only, kobo strings, `['org', orgId, …]` query keys, axe-clean in both themes.

## M2: Events, awardees, summary, then admin screens (built)

What was built, and where it differs from the plan:

- **Events:** the list (newest first) and "New event" for editors and admins.
- **The event page:**
  - the header, with a "Closed" badge and banner;
  - Close and Reopen for admins, each behind a confirmation;
  - the totals table (`<table>` with a caption and `th scope`) and the event totals;
  - "Add awardee" inline for editors while the event is open;
  - Edit (its own page) and Delete for admins. Deleting an awardee that has donations explains the 409.
- **Admin pages:**
  - Members: change role, remove, and the last-admin 409 explained.
  - Invite codes: create, then a large code with Copy and a WhatsApp link, plus the list with status and Revoke.
  - Audit log: filter by what changed and by who, 50 a page, with before and after per field.
- **Leaving:** "Leave organisation" is on the events page for every role, not only on the admin-only Members page.
- **Not built:** renaming the organisation (`PATCH /orgs/{orgId}`). It's a small form; add it with the M5 polish.
- **Tests:** `e2e/m2.spec.ts` covers an admin and a viewer, with axe and a no-sideways-scroll check on every page.

## M3: Donations (built)

How donations work in the backend: each awardee has their own donation (on the awardee) and any number of supporter donations. A general donation has no awardee and counts for the whole event. Editors and admins create; only admins edit or delete; everyone can list.

What was built, and where it differs from the plan:

- **The entry screen** (`/orgs/{orgId}/events/{eventId}/record`, editors and admins, open events):
  - "Who is it for?" picks an awardee (in notebook order) or General. It stays chosen between entries.
  - A sticky bar with who is being recorded for, their running total (from the summary) and a sync status. The new total is announced once after each save.
  - The amount: `inputmode="numeric"`, parsed by `parseNairaInput`, read back as "= ₦150,000" and, from 100,000 naira, in words ("one hundred and fifty thousand naira"). Quick amounts for 10k, 20k, 50k, 100k, 200k and 500k.
  - The donor's name, with suggestions from the event's earlier donors (a native `datalist`).
  - Cash / Transfer / Pledge, defaulting to Transfer, kept between entries.
  - "Note or check later" (folded): the `needsReview` flag and a note of up to 500 characters.
  - Save with Enter or the large button. The form clears, keeps the awardee and payment mode, and focus returns to the donor's name.
  - Undo for 10 seconds, **admins only** (the backend lets only admins delete; see BACKEND-ISSUES.md, item 6). "Saved on this phone just now" lists the last 10 entries for a quick check.
  - Client ids and drafts: DECISIONS.md, items 16 and 17.
- **The donations list** (`…/donations`, every role): oldest first, 100 a page, filtered by awardee through `?awardee=`. Each entry shows who it's for, the mode, Pledged or Received, the "Check later" flag and the note. Awardee names in the totals table link to their donations.
- **Edit donation** (`…/donations/{id}`, admins, open events): every field, plus "Has this pledge been paid?" for pledges. Sends `version`; a 409 offers "Load the latest version". Delete is on the same page.
- **Not built:** a list of general donations on their own (the API can't filter them; BACKEND-ISSUES.md, item 7). The pledge follow-up view stays in M5.
- **Tests:** `src/lib/m3-helpers.test.ts` (amounts in words, bodies, retries) and `e2e/m3.spec.ts` (admin and editor, axe and no sideways scroll on every new page).

## M4: Offline outbox and sync

Folder design (not built yet):

```
src/lib/offline/
  db.ts          Dexie tables: outbox (donation + eventId + status + attempts + lastError),
                 donorNames (per event, for autocomplete). `drafts` exists since M3 (src/lib/db.ts)
  outbox.ts      enqueue(donation) -> writes IndexedDB first, then tries to send
  sync.ts        drains the outbox in batches of up to 500 to POST /donations/batch;
                 marks `created` and `duplicates` as done (idempotent on client ids);
                 single-flight via navigator.locks('ovation-sync')
  triggers.ts    sync on: app open, focus/visibilitychange, `online`, a visible
                 "Sync now" button, and after each enqueue. No reliance on Background
                 Sync (iOS has none)
  storage.ts     navigator.storage.persist() on first entry; estimate() warning
  status.ts      useSyncStatus(): pending count, last success, last error
```

Rules:

- Entering a donation offline must not need a valid access token. Sync waits for `ensureAccessToken()`.
- **Never wipe the outbox because a session expired.** Logout with unsynced entries is blocked behind a warning that offers an export (CSV or JSON of the pending entries).
- **Session end with unsynced entries:** when a 401 or the expired replay window (DECISIONS.md, item 4) ends the session, keep the capture screen working offline. Show "Sign in again to sync" instead of sending the user to the login page, and only drain the outbox for the same user id after they sign in again.
- Donor names: the backend accepts 1 to 200 characters (`create-donation.dto.ts`). Awardee names are 1 to 200 as well, and notes up to 500. These limits are not in the OpenAPI document yet, so mirror them in `validation.ts`.
- A 4xx for one entry (for example a closed event) marks that entry "needs attention". It is never dropped silently.
- Ask for persistent storage, and warn when unsynced entries are older than a day.
- Precache the app shell HTML for offline starts. Every page is a client shell with no data in its HTML, so caching it is safe. Never cache `/api/*`.
- The refresh-token warning: the `SessionManager.refreshTokenExpiresAt()` banner shows when offline for close to 7 days.

## M5: Export, pledges, polish

- An "Export to Excel" button: `GET /events/{id}/export.xlsx` with `parseAs: 'blob'`, downloaded with a sanitised file name (event name, letters, digits and dashes).
- A pledge follow-up view: pledged donations by awardee, a "Mark received" action for admins (PATCH with `version`). The edit page can already mark a single pledge as paid.
- Performance:
  - bundle analysis;
  - route-level code splitting;
  - Lighthouse on a mid-range Android profile;
  - INP on the entry screen under 200 ms.

## M6: Frontend deployment

- Choose a host. Any Node host works, because nonce CSP needs per-request rendering.
- Add staging and production environments with `NEXT_PUBLIC_API_URL` per environment.
- Add each frontend origin to the backend `CORS_ORIGINS`.
- Set the GitHub repository variables `NEXT_PUBLIC_API_URL` and `E2E_API_URL` (staging) so CI runs the backend flows.
- Add a custom domain, and HSTS preload once the domain is stable.

## Backlog (needs backend work first)

- Forgot password and email verification. Until then the login page says recovery is unavailable.
- Transfer confirmation fields (reference, sender bank, confirmed by and at).
- Account and organisation deletion. Billing.
- Known backend bugs and contract gaps: see [BACKEND-ISSUES.md](BACKEND-ISSUES.md).
