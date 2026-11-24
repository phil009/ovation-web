import { defineConfig, devices } from "@playwright/test";

/**
 * E2E runs against the production build (`pnpm build` first), on port 3000, the origin the
 * staging backend allows in CORS_ORIGINS.
 *
 * - Specs that need a backend (register, login, join) run only when E2E_API_URL is set to
 *   the same origin the app was built with (NEXT_PUBLIC_API_URL).
 * - Auth specs run one at a time: the backend allows 10 auth requests a minute per caller.
 */
const PORT = Number(process.env.E2E_PORT ?? 3000);
/** E2E_BASE_URL: test an already running server (for example `pnpm dev`) instead. */
const BASE_URL = process.env.E2E_BASE_URL;

export default defineConfig({
  testDir: "./e2e",
  timeout: 180_000,
  expect: { timeout: 30_000 },
  fullyParallel: false,
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? "github" : "list",
  use: {
    baseURL: BASE_URL ?? `http://localhost:${PORT}`,
    trace: "retain-on-failure",
  },
  projects: [{ name: "android-chrome", use: { ...devices["Pixel 7"] } }],
  webServer: BASE_URL
    ? undefined
    : {
        command: `pnpm start --port ${PORT}`,
        url: `http://localhost:${PORT}/offline`,
        reuseExistingServer: false,
        timeout: 120_000,
      },
});
