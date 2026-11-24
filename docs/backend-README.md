# Ovation API

The backend for **Ovation**: live capture, totals and reporting of donations at honouring events
(town unions, church harvests, title-taking, weddings, fundraising dinners). An event has
**awardees**; supporters give **donations** under an awardee, or "for all" awardees (a general donation).
Ovation records money. It does not collect or hold it.

People sign up for an **account**, create or join **organisations** (a town union, a church...), and work
on that organisation's events. One account can belong to several organisations, with a different role in each.
People join with a shareable **invite code**.

Built with NestJS 12, PostgreSQL 17, Prisma 7 (Postgres driver adapter), pnpm 10, Node 24. ESM throughout.

---

## Contents

1. [Quick start](#1-quick-start)
2. [Environment variables](#2-environment-variables)
3. [Commands](#3-commands)
4. [How the API works](#4-how-the-api-works)
5. [API reference](#5-api-reference)
6. [Using the API (examples)](#6-using-the-api-examples)
7. [Testing](#7-testing)
8. [TypeScript SDK for the frontend](#8-typescript-sdk-for-the-frontend)
9. [Monitoring (NestJS Observe)](#9-monitoring-nestjs-observe)
10. [Project layout](#10-project-layout)
11. [Working on the code](#11-working-on-the-code)
12. [Deployment (Render)](#12-deployment-render)
13. [Troubleshooting](#13-troubleshooting)
14. [Known gaps](#14-known-gaps)

---

## 1. Quick start

**You need:** Node **24** (`node -v`; the repo refuses other majors), pnpm 10, Docker Desktop.
Commands below are for PowerShell.

```powershell
pnpm install
pnpm approve-builds                    # allow @prisma/engines, prisma and argon2 to build
Copy-Item .env.example .env            # then fill in the secrets (see section 2)

docker compose up -d                   # Postgres on localhost:15432
pnpm exec prisma migrate deploy        # create the tables
pnpm exec prisma generate              # generate the Prisma client into src/generated/prisma
pnpm db:seed                           # optional: an account + an organisation it administers

pnpm start:dev                         # API on http://localhost:5000/api, restarts on save
```

Then open **http://localhost:5000/api/docs**, the Swagger page where you can try every endpoint.
Register or log in (`POST /api/auth/register` or `/login`), click **Authorize** and paste the `accessToken`.

---

## 2. Environment variables

Kept in `.env` (git-ignored). `.env.example` lists them all. They are **checked at startup**:
a missing or weak value stops the app with a message saying what to fix.

| Variable | Required | Purpose |
| --- | --- | --- |
| `DATABASE_URL` | yes | Postgres connection string. Matches `docker-compose.yaml` by default. |
| `JWT_ACCESS_SECRET` | yes | Signs 15-minute access tokens. At least 32 random characters. |
| `NODE_ENV` | no | `development` (default), `production` or `test`. |
| `CORS_ORIGINS` | in production | Frontend URLs allowed to call the API from a browser, comma-separated. Empty in development means any origin. |
| `TRUST_PROXY` | behind a proxy | Usually `1`. Lets rate limits see the real client IP instead of the proxy's. |
| `RATE_LIMIT_PER_MINUTE` | no | Requests per minute per caller on ordinary routes. Default 300. |
| `AUTH_RATE_LIMIT_PER_MINUTE` | no | Same for login, register, refresh, password change and invite codes. Default 10. |
| `PORT` | no | Default `5000`. |
| `SEED_ADMIN_EMAIL`, `SEED_ADMIN_PASSWORD`, `SEED_ORG_NAME` | for seeding | Used by `pnpm db:seed` only. |
| `SDK_DOWNLOAD_ENABLED` | no | `false` turns off the SDK download route. |
| `OBSERVE_APP_KEY`, `OBSERVE_APP_SECRET` | no | NestJS Observe credentials. Without them nothing is sent. |
| `OBSERVE_ENABLED` | no | `false` stops this machine from reporting to Observe. |
| `OBSERVE_SERVICE_ID` | no | The service name in Observe. Default `ovation-api`; staging uses `ovation-api-staging`. |
| `DOCS_ENABLED` | no | `false` hides `/api/docs` and `/api/openapi.json` (production). |

`JWT_REFRESH_SECRET` is no longer used: refresh tokens are now random strings stored hashed in the database (section 4).

Generate a secret:

```powershell
node -e "console.log(require('crypto').randomBytes(48).toString('base64url'))"
```

---

## 3. Commands

Always use `pnpm exec`, not `npx`, so the project's pinned versions run.

| Command | What it does |
| --- | --- |
| `pnpm start:dev` | Run the API with reload on save |
| `pnpm build` then `pnpm start:prod` | Compile to `dist/` and run it |
| `pnpm test:smoke` | End-to-end test against the running API (section 7) |
| `pnpm db:seed` | Create an account and an organisation it administers (safe to run again) |
| `docker compose up -d` / `docker compose down` | Start / stop Postgres (data survives in a Docker volume) |
| `docker compose --profile app up --build` | Also build and run the **production image** on `http://localhost:5001/api` against a fresh database (section 12) |
| `pnpm exec prisma migrate dev --name <name>` | After editing `schema.prisma`: create and apply a migration |
| `pnpm exec prisma migrate deploy` | Apply existing migrations (fresh machine, production) |
| `pnpm exec prisma generate` | Regenerate the client. Prisma 7 does **not** do this automatically. |
| `pnpm exec prisma studio` | Browse and edit the database in the browser |

---

## 4. How the API works

**Everything is under `/api`.**

**Request flow:** request → helmet headers, CORS → `ValidationPipe` (unknown fields stripped, DTOs validated) →
`JwtAuthGuard` (who are you?) → `ThrottlerGuard` (too many requests?) → `OrgAccessGuard` (are you allowed,
in this organisation?) → controller → service → Prisma → Postgres.

### Accounts and sessions

- Anyone can **register** with name, email and password (8 to 128 characters). There's no email verification yet.
- **Login and register** return an `accessToken` (a JWT, valid 15 minutes, sent as `Authorization: Bearer ...`)
  and a `refreshToken` (valid 7 days).
- **Refresh tokens are single-use.** `POST /auth/refresh` returns a new pair and the old refresh token is spent.
  Store the new one every time.
  - **Sliding expiry:** each refresh issues a token valid 7 days from that moment. A user who opens the app at least
    once a week stays signed in; there's no absolute maximum session length yet.
  - **Retries are safe for 2 minutes.** If the response to a refresh is lost, send the old token again: within
    2 minutes of its first use, and while the replacement hasn't been used yet, you get the **same** new refresh
    token back (with a fresh access token). Two tabs refreshing at the same moment also both get the same token.
    The replacement is stored encrypted with a key derived from the old token, so the database alone can't reveal it.
  - Sending a spent token **later than 2 minutes** is treated as possible theft, and every session of that account
    is ended. Sending it after its replacement was already used gives 401 (sign in again).
- **Error bodies** always look like `{ "statusCode": 401, "message": "...", "error": "Unauthorized" }`. On 400,
  `message` is a list of strings (one per invalid field). The OpenAPI document calls this `ErrorResponseDto` and
  sets it as every endpoint's `default` response, so the SDK types `error`.
- **Logout** ends one session, **logout-all** ends every session (all devices), and **changing the password** ends
  all other sessions. An access token that was already issued keeps working until it expires (at most 15 minutes).
- Only a SHA-256 hash of each refresh token is stored, so a database leak doesn't hand out sessions.

### Organisations, roles and access

- Any account can **create an organisation** and becomes its first **ADMIN**.
- Roles are **per organisation**: someone can be ADMIN of their town union and VIEWER in their church.

| Role in the organisation | Can |
| --- | --- |
| `ADMIN` | Everything: edit and delete, close and reopen events, manage members and invite codes, read the audit log |
| `EDITOR` | Create events, awardees and donations; read everything |
| `VIEWER` | Read events, awardees, donations, summaries and exports |

- **Every route declares its rule** (`@OrgAccess(role, where-the-org-comes-from)`, `@AccountScope()` or `@Public()`).
  A route without one is refused, so a forgotten check can't leak data.
- **Outside the organisation you get 404, not 403**, so the API doesn't even confirm that another organisation's
  event or donation exists. Inside it, a role that's too low gets 403.
- An organisation always keeps **at least one admin**: the last admin can't leave or be demoted (409).
  To leave, make someone else admin first.

### Invite codes

- An admin creates a code such as `OVN-7K2P-QX9M` with a role (EDITOR or VIEWER), an optional number of uses,
  and an expiry (default 7 days, at most 90). They share it, for example on WhatsApp.
- The person signs up or logs in, can **preview** it ("Join Umuoji Town Union as Editor?"), then **accepts** it
  and joins immediately.
- Typing is forgiving: case, spaces and dashes are ignored (`ovn 7k2p qx9m` works).
  The code alphabet has no 0/O or 1/I/L.
- Responses: 404 for a code that never existed; **410 Gone** for one that expired, was used up or was revoked.
  Admins can revoke a code at any time.
- Admins aren't made by code. Join as editor or viewer, and an admin promotes you.

### Money is kobo, sent as strings

1 naira = 100 kobo. Amounts are stored as `BIGINT` kobo and travel as **digit strings**:
`"5000000"` = ₦50,000. JSON numbers can't hold BigInt safely, and floats cause rounding errors.
Never send `50000.00` or a number type; it is rejected with 400.

| Notebook | Naira | Send as `amountKobo` |
| --- | --- | --- |
| 100k | ₦100,000 | `"10000000"` |
| 3M | ₦3,000,000 | `"300000000"` |

### Donation ids come from the client, so retries are safe

The client creates each donation's `id` (`crypto.randomUUID()`) before sending it. Sending the same donation twice,
whether a retry, a flaky network or an offline queue resending, never creates a duplicate:

- `POST /donations` with an existing id returns the existing donation.
- `POST /donations/batch` saves new ids and lists the rest under `duplicates`.

### Optimistic locking (edits can't silently overwrite each other)

Every donation has a `version`. To edit, send the `version` you last read. If someone else saved
in between, the version has moved on and you get **409 Conflict**. Reload and try again.

### Nothing financial is ever hard-deleted

- Donation and awardee deletes set `deletedAt` (a soft delete): the row leaves lists and totals but stays in the database.
- An awardee can't be deleted while it still has donations (409).
- A **closed** event refuses every write (409) until an admin reopens it.
- Removing a *member* does delete the membership; the audit log keeps the record.

### Totals are computed, never stored

`GET /events/:eventId/summary` adds up the rows on every call, so totals can't drift from the data.

### Excel export

`GET /events/:eventId/export.xlsx` downloads the event in the client's notebook layout. It has one sheet,
**Donations**, with the columns Awardee, Donation, Payment note, Supporter, Supporter amount, Supporter payment note,
Total, Photo number, Check flag and Notes.

- Each awardee is a highlighted row, followed by their supporters, then one empty row for adding a supporter by hand.
  A bold **Total** row (Excel formulas) closes the block.
- After the awardees: the general donations and the grand totals (also formulas), then how much is still only pledged.
- Donations marked `needsReview` are highlighted, with `CHECK` and the note.
- Amounts are in naira. Formulas also carry their values, so the totals show even in viewers that don't recalculate.

### Audit log

Every write saves an `audit_log` row: who did it, what, and the row **before** and **after**. This covers events,
awardees and donations, and also organisations, memberships (joins, role changes, removals) and invite codes.
It is written in the **same database transaction** as the change, so both are saved or neither is.
The changed row is locked during the write, so the "before" is always accurate.
Each organisation's admins read their own log at `GET /orgs/:orgId/audit-log`.

### Security settings

- **helmet** sets security headers on every response (no MIME sniffing, no framing, HSTS, CSP...).
- **Rate limits** (`@nestjs/throttler`): 300 requests a minute per caller, and 10 a minute on login, register,
  refresh, logout, password change and invite codes. Over the limit you get **429**.
  - A "caller" is the IP plus the email or refresh token being tried, plus the user once logged in.
    Many phones at one venue can share an IP on Nigerian mobile networks, so an IP alone would lock out honest users.
  - Counters live in memory, per server instance.
- **CORS** allows only `CORS_ORIGINS` in production.
- Login spends the same time on an unknown email as on a wrong password and gives the same answer,
  so it doesn't reveal which emails have accounts. Register does reveal it (409), as most sign-up forms do.

---

## 5. API reference

Full, always-current details: **`/api/docs`** (Swagger UI) or **`/api/openapi.json`**.
"Role" is the caller's minimum role **in the organisation that owns the resource**.

### Account

| Method and path | Who | Purpose |
| --- | --- | --- |
| `POST /api/auth/register` | public | `{ name, email, password }` → tokens and user |
| `POST /api/auth/login` | public | `{ email, password }` → tokens and user |
| `POST /api/auth/refresh` | public | `{ refreshToken }` → new pair; the old token stops working |
| `POST /api/auth/logout` | public | `{ refreshToken }` → ends that session (204) |
| `POST /api/auth/logout-all` | logged in | Ends every session of the account (204) |
| `PATCH /api/auth/password` | logged in | `{ currentPassword, newPassword }` → new tokens; other sessions end |
| `GET /api/auth/me` | logged in | Profile plus `memberships: [{ role, organization: { id, name } }]` |

### Organisations, members, invites

| Method and path | Role | Purpose |
| --- | --- | --- |
| `POST /api/orgs` | logged in | Create `{ name }`; you become ADMIN |
| `GET /api/orgs` | logged in | Your organisations, each with `myRole` |
| `GET /api/orgs/:orgId` | viewer | One organisation |
| `PATCH /api/orgs/:orgId` | admin | Rename `{ name }` |
| `GET /api/orgs/:orgId/members` | admin | Members with name, email, role |
| `PATCH /api/orgs/:orgId/members/:userId` | admin | Change role `{ role }` (409 if it would leave no admin) |
| `DELETE /api/orgs/:orgId/members/:userId` | admin, or yourself | Remove a member, or leave (409 for the last admin) |
| `POST /api/orgs/:orgId/invites` | admin | `{ role: EDITOR or VIEWER, maxUses?, expiresInDays? }` → code |
| `GET /api/orgs/:orgId/invites` | admin | Codes with `status`: ACTIVE, EXPIRED, USED_UP or REVOKED |
| `DELETE /api/orgs/:orgId/invites/:inviteId` | admin | Revoke a code |
| `POST /api/invites/preview` | logged in | `{ code }` → `{ organization, role, alreadyMember }` |
| `POST /api/invites/accept` | logged in | `{ code }` → join (404 unknown, 410 no longer valid, 409 already a member) |
| `GET /api/orgs/:orgId/audit-log?entity=&entityId=&userId=&limit=&offset=` | admin | Audit entries, newest first |

### Events, awardees, donations, reports

| Method and path | Role | Purpose |
| --- | --- | --- |
| `GET /api/orgs/:orgId/events` | viewer | Events, newest date first |
| `POST /api/orgs/:orgId/events` | editor | Create `{ name, date }` |
| `GET /api/events/:id` | viewer | One event |
| `PATCH /api/events/:id/close` and `/reopen` | admin | Close or reopen |
| `GET /api/events/:eventId/awardees` | viewer | Awardees in notebook-number order |
| `POST /api/events/:eventId/awardees` | editor | Create `{ name, number?, amountKobo?, paymentMode? }` |
| `PATCH /api/events/:eventId/awardees/:id` | admin | Update |
| `DELETE /api/events/:eventId/awardees/:id` | admin | Soft delete (409 while donations exist) |
| `POST /api/donations` | editor | Create one (idempotent on `id`) |
| `POST /api/donations/batch` | editor | Up to 500 → `{ created, duplicates }`; may span events of orgs where you're an editor |
| `GET /api/donations?eventId=&awardeeId=&limit=&offset=` | viewer | `{ items, total }`; limit default 100, max 500 |
| `GET /api/donations/:id` | viewer | One donation |
| `PATCH /api/donations/:id` | admin | Update; body must include `version` (409 if stale) |
| `DELETE /api/donations/:id` | admin | Soft delete |
| `GET /api/events/:eventId/summary` | viewer | Per-awardee totals, general donations, grand totals |
| `GET /api/events/:eventId/export.xlsx` | viewer | Excel workbook in the notebook layout |

**Other (public):**

- `GET /api/health`: 200 `{ status: "ok" }` when the database is reachable, 503 when not. Not rate limited.
- `GET /api/sdk/typescript.zip`: off when `SDK_DOWNLOAD_ENABLED=false`.
- `GET /api/docs` and `/api/openapi.json`: off when `DOCS_ENABLED=false`.

**Enums:** `paymentMode`: `CASH`, `TRANSFER`, `PLEDGE`. `status`: `PLEDGED`, `RECEIVED`
(defaults to `PLEDGED` when `paymentMode` is `PLEDGE`, otherwise `RECEIVED`).

**Error codes:**

| Code | Meaning |
| --- | --- |
| 400 | Invalid body |
| 401 | Not logged in, bad token or bad credentials |
| 403 | Your role in this organisation doesn't allow it |
| 404 | Doesn't exist, is soft-deleted, **or belongs to an organisation you're not in** |
| 409 | Closed event, stale `version`, awardee still has donations, last admin, or already a member |
| 410 | Invite code expired, used up or revoked |
| 429 | Too many requests; wait a minute |

---

## 6. Using the API (examples)

PowerShell, with the API running locally:

```powershell
$api = "http://localhost:5000/api"
$json = @{ ContentType = "application/json" }

# Sign up (or /auth/login) and keep the token
$me = Invoke-RestMethod -Method Post "$api/auth/register" @json `
  -Body (@{ name = "Ngozi Okafor"; email = "ngozi@example.com"; password = "a-long-password" } | ConvertTo-Json)
$h = @{ Authorization = "Bearer $($me.accessToken)" }

# Create an organisation (you become its admin), an event and an awardee (#1, gave 3M by transfer)
$org = Invoke-RestMethod -Method Post "$api/orgs" -Headers $h @json -Body (@{ name = "Umuoji Town Union" } | ConvertTo-Json)
$event = Invoke-RestMethod -Method Post "$api/orgs/$($org.id)/events" -Headers $h @json `
  -Body (@{ name = "Anambra Day"; date = "2026-11-08" } | ConvertTo-Json)
$awardee = Invoke-RestMethod -Method Post "$api/events/$($event.id)/awardees" -Headers $h @json `
  -Body (@{ number = 1; name = "Chief Emeka Obi"; amountKobo = "300000000"; paymentMode = "TRANSFER" } | ConvertTo-Json)

# Two supporters under the awardee plus one general ("100k for all") donation, in one batch
$batch = @{ donations = @(
  @{ id = [guid]::NewGuid(); eventId = $event.id; awardeeId = $awardee.id; donorName = "Mrs Ngozi Okafor"; amountKobo = "5000000"; paymentMode = "TRANSFER" },
  @{ id = [guid]::NewGuid(); eventId = $event.id; awardeeId = $awardee.id; donorName = "Mr Eze";           amountKobo = "2000000"; paymentMode = "PLEDGE" },
  @{ id = [guid]::NewGuid(); eventId = $event.id;                          donorName = "Lolo Ada";         amountKobo = "10000000"; paymentMode = "CASH" }
) }
Invoke-RestMethod -Method Post "$api/donations/batch" -Headers $h @json -Body ($batch | ConvertTo-Json -Depth 5)

# Totals, and the Excel file
Invoke-RestMethod "$api/events/$($event.id)/summary" -Headers $h | ConvertTo-Json -Depth 5
Invoke-WebRequest "$api/events/$($event.id)/export.xlsx" -Headers $h -OutFile anambra-day.xlsx

# Invite a helper as editor: one use, valid 3 days. Send them $invite.code.
$invite = Invoke-RestMethod -Method Post "$api/orgs/$($org.id)/invites" -Headers $h @json `
  -Body (@{ role = "EDITOR"; maxUses = 1; expiresInDays = 3 } | ConvertTo-Json)
$invite.code    # e.g. OVN-7K2P-QX9M

# ...the helper, logged in with their own token ($h2), joins:
# Invoke-RestMethod -Method Post "$api/invites/accept" -Headers $h2 @json -Body (@{ code = "OVN-7K2P-QX9M" } | ConvertTo-Json)
```

The summary for that data:

```jsonc
{
  "awardees": [{ "number": 1, "name": "Chief Emeka Obi",
                 "awardeeKobo": "300000000", "supportersKobo": "7000000", "supporterCount": 2,
                 "pledgedKobo": "2000000", "totalKobo": "307000000" }],
  "general":  { "totalKobo": "10000000", "count": 1, "pledgedKobo": "0" },
  "totals":   { "awardeesKobo": "300000000", "supportersKobo": "7000000", "generalKobo": "10000000",
                "totalKobo": "317000000", "pledgedKobo": "2000000", "receivedKobo": "315000000",
                "donationCount": 3 }
}
```

Editing a donation (admin) needs the current `version`:

```powershell
Invoke-RestMethod -Method Patch "$api/donations/<id>" -Headers $h @json `
  -Body (@{ version = 1; note = "confirmed against bank alert" } | ConvertTo-Json)
```

---

## 7. Testing

### Automated smoke test

`scripts/smoke.mjs` exercises the whole API over HTTP and prints `PASS`/`FAIL` per check
(101 checks; it exits non-zero if any fail). It registers its own throwaway users (`*@smoke.test`)
and organisations, so it needs no seed data.

```powershell
docker compose up -d
pnpm start:dev                # in one terminal
pnpm test:smoke               # in another
```

What it covers:

- **Accounts:** register (duplicate email 409, short password 400); login (wrong password and unknown email both 401); `me`.
- **Organisations:** create (creator is admin), list, rename.
- **Donations:** event, awardee and batch; resending the batch gives all duplicates; totals; optimistic locking;
  money validation; soft deletes; closed events.
- **Invite codes:**
  - The code format; ADMIN codes are refused; sloppy typing still works; preview, then accept.
  - Single-use codes get 410 on reuse; already a member gets 409; unknown codes 404; revoked codes 410;
    editors can't create codes.
  - Five people accepting one single-use code at the same moment: exactly one gets in.
- **Roles inside an org:** an editor can add but not delete; a viewer can only read; neither sees members or the audit log.
- **Isolation between orgs:** an outsider gets 404 on 13 different routes into another organisation.
  A batch mixing their own event with a foreign one is refused as a whole, and nothing is saved.
  Another organisation's awardee can't be used.
- **Members:** the last admin can't demote themselves or leave; editors can't remove others; promote, remove
  (access ends immediately), leave.
- **Audit log:** entries for events, donations and membership changes, with correct before/after; each organisation's
  log is separate.
- **Concurrency:** simultaneous creates of one id give one row and one audit entry; simultaneous edits give one 200
  and two 409s.
- **Sessions:**
  - Refresh rotation: the old token fails after use; the new access token works.
  - Logout ends one session; logout-all ends every session.
  - Password change: wrong current password gets 401; other sessions end; the old password stops working.
- **Excel:** the download name and type; the 10 columns; the awardee row; formulas on Total rows; totals equal the API summary;
  the `CHECK` flag and note on a doubtful entry.
- **Hardening:** helmet headers; login guessing hits 429.
- **Docs and SDK:** both load.

Don't run it against a shared or production database: it creates data every run. Settings:

- `API_URL` tests another server.
- `EXPECT_DOCS=false` / `EXPECT_SDK=false` expect those routes to be switched off (404), as in production mode.

It also runs in GitHub Actions on every push to `staging` and `main` (section 12).

### Manual checklist (Postman or Swagger)

1. Register, then call `GET /auth/me` with the token (200) and without it (401).
2. Create an organisation, an event, an awardee, and donations through `POST /donations/batch`.
3. Send the same batch again: `created` is empty and `duplicates` lists every id.
4. Check `GET /events/:eventId/summary` by hand, and open `GET /events/:eventId/export.xlsx` in Excel.
5. Create an invite code, register a second account in another Postman tab, accept the code, and check what
   that account can and can't do.
6. With a third account that isn't in the organisation, try to read the event: expect 404.
7. Open `/api/docs`; download `/api/sdk/typescript.zip`.
8. In the frontend repo, run `pnpm sdk:pull` and check that autocomplete works.

### Not yet

There are no unit tests (`@nestjs/testing`/Jest) yet. Good first candidates are the summary arithmetic,
batch idempotency and the access guard.

---

## 8. TypeScript SDK for the frontend

`GET /api/sdk/typescript.zip` builds a typed client from the live OpenAPI document and caches it in memory.
The zip contains:

- `schema.ts`: types generated by `openapi-typescript`
- `client.ts`: `createOvationClient()` on top of `openapi-fetch`, which adds the Bearer token
- `index.ts` and a `README.md`

In the frontend repo (`pnpm add openapi-fetch`), unpack it into `src/sdk` (the `sdk:pull` script does this) and commit it:

```ts
import { createOvationClient } from './sdk';

const api = createOvationClient({
  baseUrl: process.env.NEXT_PUBLIC_API_URL!,           // server origin, no /api; paths include it
  getAccessToken: () => session.accessToken,          // keep tokens in memory, not localStorage
});

const { data: me } = await api.GET('/api/auth/me');   // me.memberships -> organisation switcher
const { data } = await api.GET('/api/events/{eventId}/summary', { params: { path: { eventId } } });

// Binary download: ask openapi-fetch for a Blob
const { data: xlsx } = await api.GET('/api/events/{eventId}/export.xlsx', {
  params: { path: { eventId } }, parseAs: 'blob',
});
```

**Frontend notes:**

- Don't put tokens in `localStorage` (any injected script can read it). Keep the access token in memory.
- After every `POST /auth/refresh`, store the **new** refresh token; the old one is spent.
- Run one refresh at a time, for example with a shared promise. If a refresh fails on the network (no response),
  retry it with the **same old token** within 2 minutes: you get the same new token back.
- On 401 from refresh, send the user to login.
- Errors: `error.message` is `string[]` on 400 and `string` otherwise (`ErrorResponseDto`).
- Treat 404 on a resource as "not found or not yours".

The SDK is only as well-typed as the Swagger decorators. Every new DTO field needs `@ApiProperty`, and every
endpoint needs `@ApiOkResponse`/`@ApiCreatedResponse({ type: ... })`. Restart the API after changes,
because the zip is cached until restart.

---

## 9. Monitoring (NestJS Observe)

The app reports traces, errors and runtime metrics to [NestJS Observe](https://observe.nestjs.com)
(`src/observe.ts`, imported first in `AppModule`; `ObserveInstrument` is passed in `main.ts`).
Get credentials with `npx @nestjs/observe link`, which writes `OBSERVE_APP_KEY`/`OBSERVE_APP_SECRET` to `.env`.

- Traces are tagged with the user's **id**, never their email.
- Request bodies and application logs are **not** sent, because they contain donor names, amounts and passwords.
- Set `OBSERVE_ENABLED=false` to stop a machine (for example your laptop) from reporting.

---

## 10. Project layout

```
prisma/
  schema.prisma            data model (tables mapped to snake_case: organizations, memberships, events, ...)
  migrations/              SQL migrations; commit every one
  seed.ts                  creates an account + an organisation it administers
prisma7.config.ts          the Prisma config (loads DATABASE_URL); don't add a second one
scripts/smoke.mjs          end-to-end smoke test
Dockerfile                 production image (migrations run on start)
docker-compose.yaml        local Postgres; `--profile app` adds the production image
render.yaml                Render Blueprint: staging + production services and databases
.github/workflows/ci.yml   CI: type-check, build, smoke test, Docker build
src/
  main.ts                  startup: helmet, CORS, trust proxy, /api prefix, validation, Swagger, listen
  app.module.ts            root module: config (validated), rate limits, global guards
  observe.ts               NestJS Observe setup
  config/env.validation.ts the .env checks run at startup
  common/
    access/                OrgAccessGuard, @OrgAccess / @AccountScope / From.*, role ranking
    decorators/            @Public(), @CurrentUser(), @CurrentMembership()
    throttle.ts            rate-limit key and @SensitiveThrottle()
    money.ts               kobo patterns and toKobo()
  prisma/                  PrismaService (driver adapter), lockRow() / lockOrgAdmins()
  generated/prisma/        generated client (git-ignored; run prisma generate)
  modules/
    auth/                  register, login, refresh (rotation), logout, password, me
    orgs/                  organisations, members, invite codes
    events/                events + close/reopen; assertOpen() used by other modules
    awardees/              awardees under an event
    donations/             single, batch, list, versioned update, soft delete
    reports/               per-event summary and Excel export
    audit/                 AuditService (writes) and GET /orgs/:orgId/audit-log (reads)
    health/                GET /api/health (database ping, used by Render)
    sdk/                   SDK zip download
```

---

## 11. Working on the code

- **ESM:** relative imports end in `.js`, even in `.ts` files (`import { X } from './x.js'`).
- **Every new route needs an access rule**, or it answers 403 to everyone:
  - `@OrgAccess(Role.VIEWER | EDITOR | ADMIN, From.orgParam() | From.eventParam('id') | From.eventBody() | From.eventQuery() | From.donationParam() | From.batchEvents())`
    for anything inside an organisation;
  - `@AccountScope()` for account-level routes;
  - `@Public()` only on purpose.

  If a new resource type needs it, add a resolver to `From` in `src/common/access/org-access.decorator.ts`.
- **Types used in decorated parameters** (`AuthUser`, `RequestMembership`) must be imported with `import type`.
- **Schema changes:** edit `schema.prisma`, run `prisma migrate dev --name <what>`, then `prisma generate`.
  Read the generated SQL before committing.
  - For changes that must move existing data (a new required column, an enum rename), generate the SQL with
    `prisma migrate diff` and hand-edit it. Examples: `20261124090000_organizations_invites_refresh_tokens`
    and `20261123120000_fix_donation_status_spelling`.
  - `migrate dev` refuses to run in a non-interactive terminal; use `--create-only` or `migrate diff` there.
- **New write endpoints** must run in `this.prisma.$transaction(async (tx) => ...)` and call
  `this.audit.record(tx, { userId, organizationId, ... })`.
  - For an update or delete, call `lockRow(tx, ...)` before reading "before".
  - Pass `tx` to helpers such as `events.assertOpen(id, tx)` so they read inside the transaction.
- **Money:** validate with `KOBO_POSITIVE`/`KOBO_ZERO_OK` and convert with `toKobo()`. No floats, except at the
  Excel boundary, where cells are numbers.
- **Swagger:** add `@ApiProperty` on every DTO field and a typed response decorator on every endpoint (section 8).
- Never commit `.env`.

---

## 12. Deployment (Render)

The API runs on [Render](https://render.com) in Frankfurt as a Docker container, described in `render.yaml`
(a Render "Blueprint").

**Right now there is only staging, and it costs $0.**

| | Staging (now) | Production (later) |
| --- | --- | --- |
| Branch | `staging` | `main` |
| URL | `https://ovation-api-staging.onrender.com/api` | `https://ovation-api.onrender.com/api` |
| Used for | Building and testing the frontend | Real events |
| Instance | Render **free**: sleeps after 15 min idle; the first request then takes about a minute | Smallest always-on, `0.5c-512mb` (paid) |
| Database | **Neon free** Postgres in Frankfurt (doesn't expire) | Render Postgres, smallest paid plan, with backups |
| Swagger docs, SDK download | On | Off |

- **Why Neon for staging:** free Render Postgres is deleted after 30 days.
- **When to add production:** about two weeks before the first real event. Uncomment the production section in
  `render.yaml` (it needs a card on Render; at the time of writing about $7 for the instance plus about $10 for the
  database, per month). Then apply the Blueprint again.
- If the `.onrender.com` name is already taken, Render adds a suffix. The real URL is on the service's page.

### How a change goes live

1. Push to `staging` (or merge `staging` into `main` for production).
2. **GitHub Actions** (`.github/workflows/ci.yml`) type-checks, builds, starts the API against a fresh Postgres,
   runs all smoke checks, and builds the Docker image.
3. Only if CI passes, **Render** builds the `Dockerfile` (`autoDeployTrigger: checksPass`).
4. The new container runs `prisma migrate deploy`, then starts the API.
5. Render waits for `GET /api/health` to return 200, then switches traffic to the new version.

If the migration fails or the health check never passes, the previous version keeps serving and nothing breaks.

Suggested flow: feature branch → pull request into `staging` → try it with the frontend → pull request `staging` → `main`.

### First-time setup (once)

1. **Create the database on Neon** ([neon.tech](https://neon.tech), free plan):
   - Make a new project in region **AWS Europe Central 1 (Frankfurt)**, with Postgres 17.
   - Copy the connection string. Use the **direct** one: turn "Connection pooling" off in the Connect dialog.
   - It looks like `postgresql://user:pass@ep-xxx.eu-central-1.aws.neon.tech/neondb?sslmode=require`.
2. **Push** `staging` with `render.yaml` on it.
3. In Render: **New → Blueprint**. Connect GitHub, pick `phil009/ovation-backend` and the **`staging`** branch.
   Render lists one free web service, so no card is needed.
4. Fill in the values it asks for:
   - **`DATABASE_URL`**: the Neon connection string from step 1.
   - **`CORS_ORIGINS`** (required: production mode refuses to start without it): `http://localhost:3000`, plus the
     staging frontend URL later, comma-separated.
   - **`OBSERVE_APP_KEY` / `OBSERVE_APP_SECRET`**: the same values as your local `.env`, or leave them empty to send nothing.
5. Click **Apply**. The first build takes a few minutes, and the container creates all tables on Neon by itself
   (migrations run on start).
6. Check `https://ovation-api-staging.onrender.com/api/health`. Expect `{"status":"ok",...}`.
7. In the frontend repo, set `OVATION_API_URL` to the staging URL and run `pnpm sdk:pull`.

Production has no seed data. When it exists, create the first real account and organisation through the API or the
frontend (`POST /api/auth/register`, then `POST /api/orgs`), then invite helpers with codes.

`JWT_ACCESS_SECRET` is generated by Render, separately for each environment, so tokens from staging never work on production.
Don't change it casually: changing it logs everyone out.

### Day to day

- **Change a setting:** service → **Environment** → edit → save (the service restarts).
- **Logs:** service → **Logs**. Errors and slow requests also appear in Observe.
- **Roll back:** service → **Events** → pick an earlier successful deploy → **Rollback**.
  - A rollback does **not** undo database migrations.
  - So keep migrations backward-compatible: add a column in one release, and remove old ones only in a later release.
- **Run the smoke test against staging** (never production: it creates test accounts and organisations):

  ```powershell
  $env:API_URL = "https://ovation-api-staging.onrender.com/api"; node scripts/smoke.mjs; Remove-Item Env:API_URL
  ```

- **Look at the staging database:** use Neon's web console (Tables / SQL editor). Or point Prisma Studio at it from
  your laptop for one session:
  `$env:DATABASE_URL = "<neon url>"; pnpm exec prisma studio`. Never put the Neon URL in `.env`, which is your local database.
- **Reset staging data:** in Neon, create a branch from an empty point, or drop and recreate the database. Then redeploy
  the Render service, and migrations rebuild the tables.
- **Production backups (later):** paid Render Postgres is backed up automatically. The database's **Recovery** page
  shows the retention and how to restore (a restore creates a new database). Practise one restore before the first real event.
- **Custom domain later:** service → **Settings → Custom Domains** (for example `api.ovation.ng`). Render issues
  the HTTPS certificate. Then update the frontend's API URL, and `CORS_ORIGINS` if the frontend's domain changes.

### Running the production image locally

```powershell
docker compose --profile app up --build      # API on http://localhost:5001/api, empty ovation_container database
$env:API_URL = "http://localhost:5001/api"; $env:EXPECT_DOCS = "false"; $env:EXPECT_SDK = "false"
node scripts/smoke.mjs
docker compose --profile app stop api        # Postgres keeps running for normal development
```

The image is about 1 GB uncompressed. Most of that is the Node base image plus the Prisma CLI, which is kept so
migrations can run on start. That's fine for now; a separate migration image could shrink it later.

---

## 13. Troubleshooting

| Symptom | Fix |
| --- | --- |
| App exits at startup with `Invalid environment configuration` | It lists what's wrong in `.env`. Compare with `.env.example`. |
| `error during connect ... dockerDesktopLinuxEngine` | Docker Desktop isn't running. Start it and wait for it to be ready. |
| Postgres port won't bind | Windows reserves some port ranges; that's why the host port is 15432. Pick another high port in `docker-compose.yaml` and `.env`. |
| `listen EADDRINUSE :::5000` | Another server is already running. Find it with `Get-NetTCPConnection -LocalPort 5000` and stop it, or change `PORT`. |
| 403 "This route has no access rule" | A new route is missing `@OrgAccess`, `@AccountScope` or `@Public` (section 11). |
| 404 on something that exists | You're not a member of the organisation that owns it. Check `GET /auth/me`. |
| 429 Too Many Requests | Rate limit; wait a minute. Raise `AUTH_RATE_LIMIT_PER_MINUTE` for local testing if needed. |
| Every request from your proxy hits 429 together | Set `TRUST_PROXY=1` so limits use the real client IP. |
| `Cannot find module '../generated/prisma/client.js'` | Run `pnpm exec prisma generate`. |
| TS1272 "must be imported with 'import type'" | Use `import type` for interfaces in decorated signatures (section 11). |
| `Unsupported engine` on install | You're not on Node 24. Run `node -v` and install Node 24. |
| argon2 or Prisma errors after install | Run `pnpm approve-builds`, then `pnpm install` again. |
| SDK changes don't show up | The zip is cached in memory. Restart the API. |
| Render deploy fails with `Invalid environment configuration` | Usually `CORS_ORIGINS` is empty. Set it under the service's Environment tab. |
| Render deploy stuck "waiting for health check" | Open the service Logs: a failed migration or a database connection error shows there. The old version keeps serving meanwhile. |
| Staging takes about a minute to answer | The free instance was asleep (15 min idle). Expected; production doesn't sleep. |
| Render didn't deploy after a push | It deploys only after GitHub CI passes. Check the Actions tab on GitHub. |
| Migration fails on Neon with a connection or parameter error | Use the **direct** (non-pooled) Neon string. If it ends in `&channel_binding=require`, remove that part and keep `?sslmode=require`. |
| `docker build` times out pulling `node:24-bookworm-slim` | A Docker Hub network problem. Pull it via the mirror, then build again: `docker pull mirror.gcr.io/library/node:24-bookworm-slim; docker tag mirror.gcr.io/library/node:24-bookworm-slim node:24-bookworm-slim` |

---

## 14. Known gaps

- **No email yet:** no email verification, no "forgot password", and no email invites.
  A user who forgets their password can't recover it yet. Planned with `@nestjs/mail` before public launch.
- **Not built yet:** transfer confirmation (reference, sender bank, confirmed by and at), deleting an account or organisation,
  billing flags.
- **No unit tests yet** (the end-to-end smoke test runs in CI).
- **Rate limits and the SDK cache are per instance.** That's fine with one instance per environment. Before scaling
  production to several instances, move the throttler storage to Redis (Render Key Value).
- **Image size** is about 1 GB uncompressed (section 12).
- **Data protection:** donor names and amounts are personal data. Get advice on Nigeria's data protection law
  before storing data for paying customers.
