# Ovation Web

The frontend for **Ovation**: capture, total and report donations at honouring events. It is an installable PWA (Next.js 16, React 19, TypeScript strict). It talks to the [Ovation API](docs/backend-README.md) only through the generated SDK in `src/sdk`.

## Quick start (PowerShell)

You need Node 24 and pnpm 10.

```powershell
pnpm install
Copy-Item .env.example .env.local      # set both URLs (local backend or staging)
pnpm sdk:pull                          # download the SDK from the API into src/sdk
pnpm dev                               # http://localhost:3000
```

Staging: `https://ovation-api-staging.onrender.com`. It sleeps after 15 idle minutes, so the first request can take about a minute; the app shows "Waking the server" meanwhile. Staging's CORS allows `http://localhost:3000` only, so use that port.

## Commands

| Command                                        | What it does                                                            |
| ---------------------------------------------- | ----------------------------------------------------------------------- |
| `pnpm dev` / `pnpm build` / `pnpm start`       | Develop, build, run the production build                                |
| `pnpm lint` / `pnpm typecheck` / `pnpm format` | ESLint (jsx-a11y strict), TypeScript (app and service worker), Prettier |
| `pnpm test`                                    | Vitest: money, contrast, redirect, session manager, form components     |
| `pnpm test:e2e`                                | Playwright against the production build (run `pnpm build` first)        |
| `pnpm sdk:pull`                                | Refresh `src/sdk` from `OVATION_API_URL` (never edit `src/sdk` by hand) |
| `node scripts/render-icons.mjs`                | Re-render the PNG app icons from `public/icons/*.svg`                   |

### End-to-end tests

```powershell
pnpm build; pnpm test:e2e                                  # public pages: axe, CSP, service worker, offline
$env:E2E_API_URL = "https://ovation-api-staging.onrender.com"; pnpm test:e2e   # plus register/login/join flows
```

- `E2E_PORT` changes the port (default 3000).
- `E2E_BASE_URL` points the tests at a server that is already running.
- The flows create throwaway accounts on the backend. Never point them at production.

## Docs

- [docs/DECISIONS.md](docs/DECISIONS.md): why things are the way they are
- [docs/SECURITY.md](docs/SECURITY.md): threat model and accepted risks
- [docs/ACCESSIBILITY.md](docs/ACCESSIBILITY.md): what is enforced, plus the manual checklist
- [docs/ROADMAP.md](docs/ROADMAP.md): milestones M2 to M6
- [docs/backend-README.md](docs/backend-README.md): the API contract
