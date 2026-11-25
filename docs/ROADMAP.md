# Roadmap

M0 (foundation), M1 (auth and organisations), M2 (events, awardees, totals and admin screens) and M3 (donations) and M4 (offline recording and sync) are built. This is the plan for the rest. Each milestone ships behind the same rules: SDK types only, kobo strings, `['org', orgId, …]` query keys, axe-clean in both themes.

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
  - Undo in the toast for 10 seconds, and on each entry in "Saved on this phone just now" (the last 10). Editors can undo their own entries for 10 minutes; admins any time.
  - Client ids and drafts: DECISIONS.md, items 16 and 17.
- **The donations list** (`…/donations`, every role): 100 a page, oldest or newest first (`?order=desc`), filtered by awardee or General (`?awardee=general`). Each entry shows who it's for, the mode, Pledged or Received, the "Check later" flag and the note. Awardee names in the totals table link to their donations.
- **Edit donation** (`…/donations/{id}`, admins, open events): every field, plus "Has this pledge been paid?" for pledges. Sends `version`; a 409 offers "Load the latest version". Delete is on the same page.
- **Not built:** the pledge follow-up view (M5), and a donor-name search box (the API supports `q`; add it if lists get long).
- **Tests:** `src/lib/m3-helpers.test.ts` (amounts in words, bodies, retries) and `e2e/m3.spec.ts` (admin and editor, axe and no sideways scroll on every new page).

## M4: Offline outbox and sync (built)

What was built, and where it differs from the plan:

- **Saving is local first.** "Save donation" writes the donation to the outbox in IndexedDB (`src/lib/offline/outbox.ts`) and returns at once, online or not. Each entry gets its client id at that moment, so every send is safe to repeat.
- **The sync engine** (`src/lib/offline/sync.ts`, unit-tested with fakes):
  - one run at a time across tabs (`navigator.locks`, lock `ovation-sync`);
  - oldest first, up to 500 per `POST /donations/batch`, one event per request; created and duplicate ids are both done;
  - connection trouble, 5xx and 429 keep everything and retry after 10 s, 30 s, then 1, 2 and 5 minutes;
  - a closed event, lost access or a removed awardee marks entries "needs attention" (a 400 splits the batch to find the bad entry). Nothing is dropped silently;
  - triggers: app start, focus, `visibilitychange`, `online`, after every save, "Send now", and its retry timer. No Background Sync (iOS has none).
- **Status everywhere:** the entry screen's sticky bar says what is on the phone and what is sent, with "Send now"; the running total shows "plus ₦… not sent yet"; a bar under the header on every page links to **Waiting to send** (`/outbox`): every unsent entry by event, Try again, Delete (refused entries only) and a CSV copy. Entries older than a day get a warning.
- **Undo** works offline: an unsent entry is just removed from the phone. Undo runs inside the sync lock, so it can't race a send.
- **Offline start:** the entry screen saves an _entry kit_ per event (name, closed, your role, awardees with last known totals) whenever it loads online, and the service worker caches the entry screen's HTML (network first, 6-second timeout). Opened with no signal, the screen works from the kit and says how old it is. `/offline` and the organisation pages list the events that work offline.
- **Sign-out** with unsent donations shows a warning with a CSV copy. Entries are kept either way and sent when the same account signs in again; the login page says how many are waiting.
- **Session end with unsent donations:** the user is sent to sign in (a session can only end while online). Entries are kept and sent after sign-in. This replaces the plan's "keep capturing while signed out" (DECISIONS.md, item 20).
- **Persistent storage** is requested on the first save. `storageNearlyFull()` exists, but no warning is shown yet (M5).
- **Tests:** `src/lib/offline/*.test.ts`, and `e2e/m4.spec.ts` (offline recording, undo, automatic send, a closed event, the CSV copy, the sign-out warning; with `E2E_SW=1` on a production build, a full offline start through the service worker).

## M5: Export, pledges, polish

- An "Export to Excel" button: `GET /events/{id}/export.xlsx` with `parseAs: 'blob'`, downloaded with a sanitised file name (event name, letters, digits and dashes).
- A pledge follow-up view: pledged donations by awardee, a "Mark received" action for admins (PATCH with `version`). The edit page can already mark a single pledge as paid.
- Show the storage warning (`storageNearlyFull()`) on the Waiting to send page.
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
