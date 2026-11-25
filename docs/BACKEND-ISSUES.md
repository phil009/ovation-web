# Backend issues

Issues the frontend found in the backend (`../backend`). They don't block current work. Fix them in the backend, then tick them here.

## Open

None.

## Done

- Retrying a lost refresh: the same replacement comes back within 2 minutes (migration `20261124150000_refresh_token_replay`).
- Each refresh issues a token valid for 7 days from that moment.
- `CreateDonationDto.awardeeId` is documented as a nullable uuid string.
- `ErrorResponseDto` is the default response on every endpoint, with the 401s on login, refresh and password change.
- The README's SDK example keeps the token in memory.

Fixed in backend 0.3.0 (deployed 2026-11-25), with smoke checks in `scripts/smoke.mjs`:

- A token ended by logout, logout-all or a password change gets a plain 401 on reuse; only tokens spent by a refresh count as theft. A password change on one phone no longer signs out the new session.
- The API version comes from `package.json` (now 0.3.0); bump it on every contract change.
- Length limits are declared in the OpenAPI document (names, email, invite code, donor name, note).
- Event names are capped at 200 characters.
- Audit `before` and `after` are typed `Record<string, unknown> | null`.
- Editors can delete (undo) a donation they created themselves, within 10 minutes. Admins can delete any.
- `GET /donations` takes `general=true`, `order=desc` and `q` (donor name search); `GET /events/{id}/donor-names` returns every distinct donor name.
