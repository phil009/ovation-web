import { expect, test, type Locator, type Page } from "@playwright/test";
import { API_URL, PASSWORD, seedOrgWithInvite, uniqueEmail } from "./helpers";

test.skip(!API_URL, "E2E_API_URL is not set");

/** Presses Tab until the target has focus. No mouse. */
async function tabTo(page: Page, target: Locator, max = 40) {
  for (let i = 0; i < max; i++) {
    if (await target.evaluate((el) => el === document.activeElement)) return;
    await page.keyboard.press("Tab");
  }
  throw new Error(`Could not reach ${target} with Tab`);
}

test("register, sign out, sign in and join with a code using only the keyboard", async ({
  page,
  request,
}) => {
  const email = uniqueEmail("kbd");

  // Register
  await page.goto("/register");
  await tabTo(page, page.getByLabel("Your name"));
  await page.keyboard.type("Chidi Eze");
  await page.keyboard.press("Tab");
  await expect(page.getByLabel("Email address")).toBeFocused();
  await page.keyboard.type(email);
  await page.keyboard.press("Tab");
  await expect(page.getByLabel(/^Password/)).toBeFocused();
  await page.keyboard.type(PASSWORD);
  // The show-password toggle is next, then submit. Enter submits from any field.
  await page.keyboard.press("Enter");
  await expect(page.getByRole("heading", { level: 1, name: "Your organisations" })).toBeVisible({
    timeout: 120_000,
  });

  // Sign out through the account menu
  await tabTo(page, page.getByRole("button", { name: "Account menu" }));
  await page.keyboard.press("Enter");
  const signOut = page.getByRole("menuitem", { name: "Sign out" });
  await expect(page.getByRole("menu")).toBeVisible();
  for (let i = 0; i < 12 && !(await signOut.evaluate((el) => el === document.activeElement)); i++) {
    await page.keyboard.press("ArrowDown");
  }
  await page.keyboard.press("Enter");
  await expect(page).toHaveURL(/\/login$/);

  // Sign in
  await tabTo(page, page.getByLabel("Email address"));
  await page.keyboard.type(email);
  await tabTo(page, page.getByLabel(/^Password/));
  await page.keyboard.type(PASSWORD);
  await page.keyboard.press("Enter");
  await expect(page.getByRole("heading", { level: 1, name: "Your organisations" })).toBeVisible();

  // Join with a code
  const seeded = await seedOrgWithInvite(request, "VIEWER");
  await tabTo(page, page.getByRole("link", { name: "Join with a code" }));
  await page.keyboard.press("Enter");
  await expect(page.getByRole("heading", { level: 1, name: "Join an organisation" })).toBeFocused();
  await tabTo(page, page.getByLabel("Invite code"));
  await page.keyboard.type(seeded.code);
  await page.keyboard.press("Enter");
  const join = page.getByRole("button", { name: "Join", exact: true });
  await expect(join).toBeVisible();
  await tabTo(page, join);
  await page.keyboard.press("Enter");
  await expect(page).toHaveURL(new RegExp(`/orgs/${seeded.orgId}$`));
  await expect(page.getByRole("heading", { level: 1, name: "Events" })).toBeVisible();
});
