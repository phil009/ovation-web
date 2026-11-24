# Backend issues

Issues the frontend found in the backend (`../backend`). They don't block current work. Fix them in the backend, then tick them here.

## Open

### 1. A password change on one device can sign out every device (bug)

`auth.service.ts`, `refresh()`: the theft check compares the time since `revokedAt` with `REUSE_GRACE_MS`. A password change and logout-all also set `revokedAt` (`changePassword`, `revokeAll`), not only rotation.

**What goes wrong:**

1. The user changes their password on phone A, which revokes phone B's token and issues a new session for A.
2. More than 2 minutes later, phone B opens the app and refreshes with its revoked token.
3. The backend treats that as theft and calls `revokeAll`. The new session on phone A ends too.

**Fix:** treat reuse as theft only for tokens revoked by rotation (`replacedById` is set). Any other revoked token gets a plain 401. Add a smoke test: change the password, wait (or back-date), refresh with the old token from another device, and check the new session still works.

The bug predates the replay change; the earlier version had the same check with 30 seconds.

### 2. The SDK version didn't change with the contract

The contract changed (`ErrorResponseDto`, the `awardeeId` type, the 401 responses), but the SDK is still `0.2.0`. Bump the version on every contract change, so `pnpm sdk:pull` shows that something changed.

### 3. Length limits are missing from the OpenAPI document

class-validator enforces them, but `@ApiProperty` doesn't declare them, so the generated SDK can't carry them. The frontend copies them into `src/lib/validation.ts` by hand.

| Field                   | Backend rule | DTO                      |
| ----------------------- | ------------ | ------------------------ |
| Account `name`          | 1 to 100     | `login.dto.ts`           |
| Organisation `name`     | 2 to 120     | `orgs.dto.ts`            |
| Awardee `name`          | 1 to 200     | `create-awardee.dto.ts`  |
| Donation `donorName`    | 1 to 200     | `create-donation.dto.ts` |
| Donation `note`         | up to 500    | `create-donation.dto.ts` |
| Invite `code` (preview) | up to 40     | `orgs.dto.ts`            |

**Fix:** add `minLength` and `maxLength` to each `@ApiProperty`.

### 4. `CreateEventDto.name` has no maximum length

`events/dto`: `@MinLength(2)` only. A very long name is stored and breaks layouts and the Excel export. The frontend caps it at 200 for now.

**Fix:** add `@MaxLength(200)` (or 120, to match organisation names) and declare it in `@ApiProperty`.

### 5. Audit `before` and `after` are typed `Record<string, never>`

`AuditEntryDto.before` and `after` are generated as `Record<string, never> | null`, which says "an object with no fields". The frontend reads them as `unknown` (`src/lib/audit.ts`).

**Fix:** declare them as `{ type: 'object', additionalProperties: true, nullable: true }` so they generate as `Record<string, unknown> | null`.

## Done

- Retrying a lost refresh: the same replacement comes back within 2 minutes (migration `20261124150000_refresh_token_replay`).
- Each refresh issues a token valid for 7 days from that moment.
- `CreateDonationDto.awardeeId` is documented as a nullable uuid string.
- `ErrorResponseDto` is the default response on every endpoint, with the 401s on login, refresh and password change.
- The README's SDK example keeps the token in memory.
