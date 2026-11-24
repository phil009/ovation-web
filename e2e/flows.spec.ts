import { expect, test, type Page } from "@playwright/test";
import {
  API_URL,
  PASSWORD,
  expectNoAxeViolations,
  seedOrgWithInvite,
  uniqueEmail,
} from "./helpers";

// Needs a real backend. Set E2E_API_URL to the origin the app was built with.
test.skip(!API_URL, "E2E_API_URL is not set");

async function checkAxeBothThemes(page: Page) {
  for (const scheme of ["light", "dark"] as const) {
    await page.emulateMedia({ colorScheme: scheme });
    await expectNoAxeViolations(page);
  }
  await page.emulateMedia({ colorScheme: "light" });
}

test("register, create an organisation, sign out, sign in, join with a code", async ({
  page,
  request,
}) => {
  const email = uniqueEmail("flow");
  const orgName = `Umuoji Town Union ${Date.now()}`;

  // Register
  await page.goto("/register");
  await page.getByLabel("Your name").fill("Ngozi Okafor");
  await page.getByLabel("Email address").fill(email);
  await page.getByLabel(/^Password/).fill(PASSWORD);
  await page.getByRole("button", { name: "Create account" }).click();
  await expect(page.getByRole("heading", { level: 1, name: "Your organisations" })).toBeVisible({
    timeout: 120_000,
  });
  await expect(page.getByText("You are not in any organisation yet.")).toBeVisible();
  await checkAxeBothThemes(page);

  // Create an organisation
  await page.getByRole("link", { name: "Create organisation" }).click();
  await expect(
    page.getByRole("heading", { level: 1, name: "Create an organisation" }),
  ).toBeVisible();
  await expect(page.getByRole("heading", { level: 1 })).toBeFocused(); // focus moved after navigation
  await checkAxeBothThemes(page);
  await page.getByLabel("Organisation name").fill(orgName);
  await page.getByRole("button", { name: "Create organisation" }).click();
  await expect(page.getByRole("heading", { level: 1, name: "Events" })).toBeVisible();
  await expect(page.getByText(orgName).first()).toBeVisible();
  await expect(
    page.getByRole("navigation", { name: "Organisation" }).getByRole("link", { name: "Members" }),
  ).toBeVisible();
  await checkAxeBothThemes(page);

  // Settings, then sign out
  await page.goto("/settings");
  await expect(page.getByRole("heading", { level: 1, name: "Settings" })).toBeVisible();
  await checkAxeBothThemes(page);
  await page.getByRole("button", { name: "Sign out", exact: true }).click();
  await expect(page).toHaveURL(/\/login$/);
  await page.goto("/orgs");
  await expect(page).toHaveURL(/\/login\?next=%2Forgs$/);

  // Sign in again (comes back to /orgs via next)
  await page.getByLabel("Email address").fill(email);
  await page.getByLabel(/^Password/).fill(PASSWORD);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page.getByRole("heading", { level: 1, name: "Your organisations" })).toBeVisible();
  await expect(page.getByRole("link", { name: new RegExp(orgName) })).toBeVisible();

  // Join another organisation with a code created by its admin
  const seeded = await seedOrgWithInvite(request, "EDITOR");
  await page.goto(`/join?code=${encodeURIComponent(seeded.code.toLowerCase())}`);
  await page.getByRole("button", { name: "Check code" }).click();
  await expect(
    page.getByRole("heading", { name: `Join ${seeded.orgName} as Editor?` }),
  ).toBeVisible();
  await checkAxeBothThemes(page);
  await page.getByRole("button", { name: "Join", exact: true }).click();
  await expect(page).toHaveURL(new RegExp(`/orgs/${seeded.orgId}$`));
  await expect(page.getByRole("heading", { level: 1, name: "Events" })).toBeVisible();
  // An editor sees no admin tabs.
  await expect(page.getByRole("navigation", { name: "Organisation" })).toHaveCount(0);

  // The single-use code is now used up.
  await page.goto(`/join?code=${seeded.code}`);
  await page.getByRole("button", { name: "Check code" }).click();
  await expect(page.getByText(/already a member|no longer valid/i).first()).toBeVisible();
});

test("wrong password shows a generic message and an error summary", async ({ page }) => {
  await page.goto("/login");
  await page.getByLabel("Email address").fill(uniqueEmail("nobody"));
  await page.getByLabel(/^Password/).fill("not-the-password");
  await page.getByRole("button", { name: "Sign in" }).click();
  const summary = page.getByRole("alert").filter({ hasText: "There is a problem" });
  await expect(summary).toBeVisible({ timeout: 120_000 });
  await expect(summary).toBeFocused();
  await expect(summary).toContainText("That email and password do not match an account.");
});

test("client-side validation links each error to its field", async ({ page }) => {
  await page.goto("/register");
  await page.getByRole("button", { name: "Create account" }).click();
  const summary = page.getByRole("alert").filter({ hasText: "There is a problem" });
  await expect(summary).toBeFocused();
  await summary.getByRole("link", { name: "Enter your email address." }).click();
  await expect(page.getByLabel("Email address")).toBeFocused();
  await expect(page.getByLabel("Email address")).toHaveAttribute("aria-invalid", "true");
});
