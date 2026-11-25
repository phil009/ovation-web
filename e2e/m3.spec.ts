import { expect, test, type APIRequestContext, type Page } from "@playwright/test";
import {
  API_URL,
  PASSWORD,
  expectNoAxeViolations,
  expectNoHorizontalScroll,
  uniqueEmail,
} from "./helpers";

// Needs a real backend. Set E2E_API_URL to the origin the app was built with.
test.skip(!API_URL, "E2E_API_URL is not set");
test.setTimeout(300_000);

async function checkAxeBothThemes(page: Page) {
  await expectNoHorizontalScroll(page);
  for (const scheme of ["light", "dark"] as const) {
    await page.emulateMedia({ colorScheme: scheme });
    await expectNoAxeViolations(page);
  }
  await page.emulateMedia({ colorScheme: "light" });
}

async function register(request: APIRequestContext, name: string) {
  const email = uniqueEmail("m3");
  const res = await request.post(`${API_URL}/api/auth/register`, {
    data: { name, email, password: PASSWORD },
    timeout: 120_000,
  });
  expect(res.ok(), await res.text()).toBeTruthy();
  const { accessToken } = (await res.json()) as { accessToken: string };
  return { email, headers: { Authorization: `Bearer ${accessToken}` } };
}

async function signIn(page: Page, email: string) {
  await page.goto("/login");
  await page.getByLabel("Email address").fill(email);
  await page.getByLabel(/^Password/).fill(PASSWORD);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page.getByRole("heading", { level: 1, name: "Your organisations" })).toBeVisible({
    timeout: 120_000,
  });
}

/** An admin's organisation with an open event, two awardees, and an editor. */
async function seed(request: APIRequestContext) {
  const admin = await register(request, "Ada Admin");
  const org = await request.post(`${API_URL}/api/orgs`, {
    headers: admin.headers,
    data: { name: `E2E M3 Union ${Date.now()}` },
  });
  expect(org.ok(), await org.text()).toBeTruthy();
  const { id: orgId } = (await org.json()) as { id: string };

  const event = await request.post(`${API_URL}/api/orgs/${orgId}/events`, {
    headers: admin.headers,
    data: { name: `Anambra Day ${Date.now()}`, date: "2026-11-08" },
  });
  expect(event.ok(), await event.text()).toBeTruthy();
  const { id: eventId, name: eventName } = (await event.json()) as { id: string; name: string };

  for (const [number, name] of [
    [1, "Chief Emeka Obi"],
    [2, "Lolo Ada"],
  ] as const) {
    const res = await request.post(`${API_URL}/api/events/${eventId}/awardees`, {
      headers: admin.headers,
      data: { number, name },
    });
    expect(res.ok(), await res.text()).toBeTruthy();
  }

  const invite = await request.post(`${API_URL}/api/orgs/${orgId}/invites`, {
    headers: admin.headers,
    data: { role: "EDITOR", maxUses: 1, expiresInDays: 1 },
  });
  const { code } = (await invite.json()) as { code: string };
  const editor = await register(request, "Eze Editor");
  const accept = await request.post(`${API_URL}/api/invites/accept`, {
    headers: editor.headers,
    data: { code },
  });
  expect(accept.ok(), await accept.text()).toBeTruthy();
  return { admin, editor, orgId, eventId, eventName };
}

const donorField = (page: Page) => page.getByLabel(/^Donor's name/);
const amountField = (page: Page) => page.getByLabel(/^Amount \(naira\)/);
const forField = (page: Page) => page.getByLabel("Who is it for?");

test("admin records, undoes, lists, edits and deletes donations", async ({ page, request }) => {
  const { admin, editor, orgId, eventId, eventName } = await seed(request);
  const eventHref = `/orgs/${orgId}/events/${eventId}`;

  await signIn(page, admin.email);
  await page.goto(eventHref);
  await expect(page.getByRole("heading", { level: 1, name: eventName })).toBeVisible();
  await page.getByRole("link", { name: "Record donations" }).click();
  await expect(page.getByRole("heading", { level: 1, name: "Record donations" })).toBeVisible();
  const bar = page.locator("p", { hasText: "Total so far" });
  await expect(forField(page)).toHaveValue(/.+/);
  await expect(page.getByText("Online. Each donation is saved")).toBeVisible();
  await checkAxeBothThemes(page);

  // Nothing typed: the error summary lists both required fields.
  await page.getByRole("button", { name: "Save donation" }).click();
  await expect(page.getByRole("link", { name: "Enter the donor's name." })).toBeVisible();
  await expect(page.getByRole("link", { name: "Enter an amount." })).toBeVisible();

  // A donation for Lolo Ada with a quick amount; the amount is read back in words.
  await forField(page).selectOption({ label: "2. Lolo Ada" });
  await donorField(page).fill("Mrs Ngozi Okafor");
  await page.getByRole("button", { name: "₦100,000" }).click();
  await expect(amountField(page)).toHaveValue("100,000");
  await expect(page.getByText("one hundred thousand naira")).toBeVisible();
  await expect(page.getByRole("radio", { name: "Transfer" })).toBeChecked();
  await page.getByRole("button", { name: "Save donation" }).click();
  await expect(page.getByText("Saved ₦100,000 from Mrs Ngozi Okafor.")).toBeVisible();
  await expect(donorField(page)).toBeFocused();
  await expect(donorField(page)).toHaveValue("");
  await expect(forField(page)).toHaveValue(/.+/);
  await expect(page.locator("p", { hasText: "Recording for" }).locator("xpath=..")).toContainText(
    "2. Lolo Ada",
  );
  await expect(bar).toContainText("100,000 naira");

  // A second one, saved with Enter, in cash. Then undo it.
  await donorField(page).fill("Mr Chidi Eze");
  await amountField(page).fill("25000");
  await page.getByRole("radio", { name: "Cash" }).check();
  await amountField(page).press("Enter");
  await expect(page.getByText("Saved ₦25,000 from Mr Chidi Eze.")).toBeVisible();
  await expect(bar).toContainText("125,000 naira");
  await expect(page.getByRole("radio", { name: "Cash" })).toBeChecked();
  await page.getByRole("button", { name: "Undo ₦25,000 from Mr Chidi Eze" }).click();
  await expect(page.getByText("Removed ₦25,000 from Mr Chidi Eze.")).toBeVisible();
  await expect(bar).toContainText("100,000 naira");

  // A general donation, flagged for checking.
  await forField(page).selectOption({ label: "General (for all awardees)" });
  await donorField(page).fill("Anonymous");
  await amountField(page).fill("5k");
  await page.getByText("Note or check later").click();
  await page.getByLabel("Check this entry later").check();
  await page.getByRole("button", { name: "Save donation" }).click();
  await expect(page.getByText("Saved ₦5,000 from Anonymous.")).toBeVisible();

  // What is being typed survives a reload.
  await donorField(page).fill("Draft Donor");
  await amountField(page).fill("7000");
  await page.waitForTimeout(1_000);
  await page.reload();
  await expect(page.getByText("We brought back what you were typing before.")).toBeVisible();
  await expect(donorField(page)).toHaveValue("Draft Donor");
  await expect(amountField(page)).toHaveValue("7000");
  await donorField(page).fill("");
  await amountField(page).fill("");
  await checkAxeBothThemes(page);

  // The list: everyone, then filtered to one awardee.
  await page.getByRole("link", { name: "All donations" }).click();
  await expect(page.getByRole("heading", { level: 1, name: "Donations" })).toBeVisible();
  await expect(page.getByRole("heading", { level: 2, name: /All donations/ })).toContainText(
    "2 donations",
  );
  await expect(page.getByText("Check later")).toBeVisible();
  await expect(page.getByText("For General")).toBeVisible();
  await checkAxeBothThemes(page);
  await page.getByLabel("Show donations for").selectOption({ label: "2. Lolo Ada" });
  await page.getByRole("button", { name: "Show" }).click();
  const results = page.getByRole("heading", { level: 2, name: /Donations for 2\. Lolo Ada/ });
  await expect(results).toBeFocused();
  await expect(results).toContainText("1 donation");

  // Someone else edits the donation first: our save gets a 409 and offers the latest version.
  const list = (await (
    await request.get(`${API_URL}/api/donations?eventId=${eventId}`, { headers: admin.headers })
  ).json()) as { items: { id: string; donorName: string; version: number }[] };
  const ngozi = list.items.find((d) => d.donorName === "Mrs Ngozi Okafor")!;
  await page.getByRole("link", { name: "Edit donation: ₦100,000 from Mrs Ngozi Okafor" }).click();
  await expect(page.getByRole("heading", { level: 1, name: "Edit donation" })).toBeVisible();
  await expect(amountField(page)).toHaveValue("100000");
  await checkAxeBothThemes(page);
  const other = await request.patch(`${API_URL}/api/donations/${ngozi.id}`, {
    headers: admin.headers,
    data: { version: ngozi.version, note: "Changed elsewhere" },
  });
  expect(other.ok(), await other.text()).toBeTruthy();
  await amountField(page).fill("150k");
  await page.getByRole("button", { name: "Save changes" }).click();
  await expect(page.getByText(/Someone else changed this donation/)).toBeVisible();
  await page.getByRole("button", { name: "Load the latest version" }).click();
  await expect(page.getByLabel(/^Note/)).toHaveValue("Changed elsewhere");
  await amountField(page).fill("150k");
  await page.getByRole("radio", { name: "Pledge" }).check();
  await expect(page.getByRole("radio", { name: "Not yet (still pledged)" })).toBeVisible();
  await page.getByRole("radio", { name: "Not yet (still pledged)" }).check();
  await page.getByRole("button", { name: "Save changes" }).click();
  await expect(page.getByText("Donation saved.")).toBeVisible();
  await expect(page.getByRole("heading", { level: 1, name: "Donations" })).toBeVisible();
  await expect(page.getByText("Pledged", { exact: true })).toBeVisible();

  // Delete the general donation. (Dismiss the toast first: hovering it pauses its timer.)
  await page.getByRole("button", { name: "Dismiss notification" }).click();
  await page.getByRole("link", { name: "Edit donation: ₦5,000 from Anonymous" }).click();
  await page.getByRole("button", { name: "Delete donation" }).click();
  await page.getByRole("alertdialog").getByRole("button", { name: "Delete donation" }).click();
  await expect(page.getByText("Donation deleted.")).toBeVisible();
  await expect(page.getByRole("heading", { level: 2, name: /All donations/ })).toContainText(
    "1 donation",
  );

  // The event totals agree.
  await page.goto(eventHref);
  const table = page.getByRole("table", { name: `Totals for ${eventName}, by awardee` });
  await expect(table.getByText("150,000 naira").first()).toBeAttached();
  await expect(table.getByRole("link", { name: "Lolo Ada", exact: true })).toBeVisible();

  // An editor records but cannot undo or edit.
  await page.goto("/settings");
  await page.getByRole("button", { name: "Sign out", exact: true }).click();
  await expect(page).toHaveURL(/\/login$/);
  await signIn(page, editor.email);
  await page.goto(`${eventHref}/record`);
  await donorField(page).fill("Mrs Ngozi Okafor");
  await amountField(page).fill("2000");
  await page.getByRole("button", { name: "Save donation" }).click();
  await expect(page.getByText("Saved ₦2,000 from Mrs Ngozi Okafor.")).toBeVisible();
  await expect(page.getByRole("button", { name: /^Undo/ })).toHaveCount(0);
  await expect(page.getByText(/ask an admin to correct it/)).toBeVisible();
  await page.getByRole("link", { name: "All donations" }).click();
  await expect(page.getByRole("heading", { level: 2, name: /All donations/ })).toContainText(
    "2 donations",
  );
  await expect(page.getByRole("link", { name: /^Edit donation/ })).toHaveCount(0);
});
