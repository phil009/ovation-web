import { expect, test } from "@playwright/test";
import { expectNoAxeViolations, watchCsp } from "./helpers";

const PUBLIC_ROUTES = [
  { path: "/login", heading: "Sign in" },
  { path: "/register", heading: "Create an account" },
  { path: "/join", heading: "Join an organisation" },
  { path: "/offline", heading: "You are offline" },
];

for (const scheme of ["light", "dark"] as const) {
  test.describe(`${scheme} theme`, () => {
    test.use({ colorScheme: scheme });

    for (const route of PUBLIC_ROUTES) {
      test(`${route.path} has no axe violations or CSP violations`, async ({ page }) => {
        const csp = watchCsp(page);
        await page.goto(route.path);
        await expect(page.getByRole("heading", { level: 1, name: route.heading })).toBeVisible();
        await expect(page.locator("h1")).toHaveCount(1);
        await expect(page).toHaveTitle(new RegExp(`${route.heading} · Ovation`));
        await expectNoAxeViolations(page);
        expect(csp).toEqual([]);
      });
    }
  });
}

test("sends the security headers and a nonce-based CSP", async ({ request }) => {
  const response = await request.get("/login");
  const headers = response.headers();
  const csp = headers["content-security-policy"] ?? "";
  expect(csp).toMatch(/script-src 'self' 'nonce-[^']+' 'strict-dynamic'/);
  expect(csp).not.toMatch(/unsafe-eval/);
  expect(csp).toContain("frame-ancestors 'none'");
  expect(csp).toContain("object-src 'none'");
  expect(headers["x-content-type-options"]).toBe("nosniff");
  expect(headers["x-frame-options"]).toBe("DENY");
  expect(headers["referrer-policy"]).toBe("strict-origin-when-cross-origin");
  expect(headers["cross-origin-opener-policy"]).toBe("same-origin");
  expect(headers["permissions-policy"]).toContain("camera=()");

  const again = (await request.get("/login")).headers()["content-security-policy"];
  expect(again).not.toBe(csp); // fresh nonce per request
});

test("protected pages send anonymous users to sign in with a safe next", async ({ page }) => {
  await page.goto("/settings");
  await expect(page).toHaveURL(/\/login\?next=%2Fsettings$/);
});

test("the dev design page is not served in production", async ({ request }) => {
  expect((await request.get("/dev/design")).status()).toBe(404);
});

test("registers the service worker and serves the manifest", async ({ page }) => {
  const csp = watchCsp(page);
  await page.goto("/login");
  const scope = await page.evaluate(async () => {
    const reg = await navigator.serviceWorker.ready;
    return reg.scope;
  });
  expect(new URL(scope).pathname).toBe("/");
  const manifest = await page.request.get("/manifest.webmanifest");
  expect(await manifest.json()).toMatchObject({ display: "standalone", start_url: "/" });
  expect(csp).toEqual([]);
});

test("shows the offline page when a navigation fails offline", async ({ page, context }) => {
  await page.goto("/login");
  await page.evaluate(async () => {
    await navigator.serviceWorker.ready;
  });
  // Make sure the worker controls the page before going offline.
  await page.reload();
  await page.waitForFunction(() => navigator.serviceWorker.controller !== null);
  await context.setOffline(true);
  await page.goto("/register");
  await expect(page.getByRole("heading", { level: 1, name: "You are offline" })).toBeVisible();
  await context.setOffline(false);
});
