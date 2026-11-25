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
  const email = uniqueEmail("m4");
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

/** An admin's organisation with an open event and one awardee. */
async function seed(request: APIRequestContext) {
  const admin = await register(request, "Ada Admin");
  const org = await request.post(`${API_URL}/api/orgs`, {
    headers: admin.headers,
    data: { name: `E2E M4 Union ${Date.now()}` },
  });
  expect(org.ok(), await org.text()).toBeTruthy();
  const { id: orgId } = (await org.json()) as { id: string };
  const event = await request.post(`${API_URL}/api/orgs/${orgId}/events`, {
    headers: admin.headers,
    data: { name: `Offline Day ${Date.now()}`, date: "2026-11-08" },
  });
  expect(event.ok(), await event.text()).toBeTruthy();
  const { id: eventId, name: eventName } = (await event.json()) as { id: string; name: string };
  const awardee = await request.post(`${API_URL}/api/events/${eventId}/awardees`, {
    headers: admin.headers,
    data: { number: 1, name: "Chief Emeka Obi" },
  });
  expect(awardee.ok(), await awardee.text()).toBeTruthy();
  return { admin, orgId, eventId, eventName };
}

const donorField = (page: Page) => page.getByLabel(/^Donor's name/);
const amountField = (page: Page) => page.getByLabel(/^Amount \(naira\)/);

async function record(page: Page, donor: string, amount: string) {
  await donorField(page).fill(donor);
  await amountField(page).fill(amount);
  await page.getByRole("button", { name: "Save donation" }).click();
  await expect(page.getByText(new RegExp(`^Saved .* from ${donor}\\.$`))).toBeVisible();
}

async function serverDonations(
  request: APIRequestContext,
  eventId: string,
  headers: Record<string, string>,
) {
  const res = await request.get(`${API_URL}/api/donations?eventId=${eventId}`, { headers });
  return ((await res.json()) as { items: { donorName: string }[] }).items.map((d) => d.donorName);
}

test("records offline, sends when back online, and flags a closed event", async ({
  page,
  context,
  request,
}) => {
  const { admin, orgId, eventId } = await seed(request);
  const recordHref = `/orgs/${orgId}/events/${eventId}/record`;
  const status = page.locator("p", { hasText: "Total so far" }).locator("xpath=..");

  await signIn(page, admin.email);
  await page.goto(recordHref);
  await expect(page.getByRole("heading", { level: 1, name: "Record donations" })).toBeVisible();
  await expect(page.getByText("All donations sent.")).toBeVisible();

  // Offline: saving still works, on the phone.
  await context.setOffline(true);
  await expect(page.getByText(/^Offline\. Keep recording/)).toBeVisible();
  await record(page, "Mrs Ngozi Okafor", "50000");
  await record(page, "Mr Chidi Eze", "20000");
  await expect(page.getByText("Offline. 2 saved on this phone, waiting to send.")).toBeVisible();
  await expect(status).toContainText("plus ₦70,000 not sent yet");
  await expect(page.getByRole("link", { name: "2 donations waiting to send" })).toBeVisible();
  await expect(page.getByText("Waiting to send").first()).toBeVisible();
  await checkAxeBothThemes(page);

  // Undo while offline removes it from the phone; nothing reaches the server.
  await page
    .getByRole("region", { name: "Saved on this phone just now" })
    .getByRole("button", { name: "Undo ₦20,000 from Mr Chidi Eze" })
    .click();
  await expect(page.getByText("Removed ₦20,000 from Mr Chidi Eze.")).toBeVisible();
  await expect(page.getByText("Offline. 1 saved on this phone, waiting to send.")).toBeVisible();

  // Back online: sent by itself, and the total catches up.
  await context.setOffline(false);
  await expect(page.getByText("All donations sent.")).toBeVisible({ timeout: 90_000 });
  await expect(status).toContainText("50,000 naira");
  await expect(status).not.toContainText("not sent yet");
  await expect(page.getByText("Sent", { exact: true })).toBeVisible();
  expect(await serverDonations(request, eventId, admin.headers)).toEqual(["Mrs Ngozi Okafor"]);

  // Saved offline, but the event is closed before it can be sent: needs attention.
  await context.setOffline(true);
  await record(page, "Late Donor", "5000");
  const close = await request.patch(`${API_URL}/api/events/${eventId}/close`, {
    headers: admin.headers,
  });
  expect(close.ok(), await close.text()).toBeTruthy();
  await context.setOffline(false);
  await expect(page.getByRole("link", { name: "1 needs attention" }).first()).toBeVisible({
    timeout: 90_000,
  });

  // The waiting list explains it, and offers a copy.
  await page.getByRole("link", { name: "1 needs attention" }).first().click();
  await expect(page.getByRole("heading", { level: 1, name: "Waiting to send" })).toBeVisible();
  await expect(page.getByText(/Needs attention: The event is closed/)).toBeVisible();
  await checkAxeBothThemes(page);
  const download = page.waitForEvent("download");
  await page.getByRole("button", { name: "Download a copy (CSV)" }).click();
  expect((await download).suggestedFilename()).toMatch(/^ovation-unsent-donations-.*\.csv$/);

  // Signing out with something unsent warns first, and keeps the entry.
  await page.goto("/settings");
  await page.getByRole("button", { name: "Sign out", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "1 donation has not been sent yet" }),
  ).toBeFocused();
  await checkAxeBothThemes(page);
  await page.getByRole("button", { name: "Cancel" }).click();

  // An admin reopens the event; "Try again" sends it.
  const reopen = await request.patch(`${API_URL}/api/events/${eventId}/reopen`, {
    headers: admin.headers,
  });
  expect(reopen.ok(), await reopen.text()).toBeTruthy();
  await page.goto("/outbox");
  await page.getByRole("button", { name: "Try again: ₦5,000 from Late Donor" }).click();
  await expect(page.getByText("Everything has been sent.")).toBeVisible({ timeout: 90_000 });
  expect((await serverDonations(request, eventId, admin.headers)).sort()).toEqual([
    "Late Donor",
    "Mrs Ngozi Okafor",
  ]);
});

// The service worker only runs in a production build (`pnpm build && pnpm start`).
test("opens the entry screen with no connection at all (service worker)", async ({
  page,
  context,
  request,
}) => {
  test.skip(process.env.E2E_SW !== "1", "Set E2E_SW=1 against a production build");
  const { admin, orgId, eventId } = await seed(request);
  const recordHref = `/orgs/${orgId}/events/${eventId}/record`;

  await signIn(page, admin.email);
  // The worker controls the page once installed; the second visit puts the page in its cache.
  await page.goto(recordHref);
  await page.evaluate(async () => {
    await navigator.serviceWorker.ready;
  });
  await page.reload();
  await expect(page.getByRole("heading", { level: 1, name: "Record donations" })).toBeVisible();
  await expect(page.getByText("All donations sent.")).toBeVisible();

  // No signal at all, and the app is opened again.
  await context.setOffline(true);
  await page.reload();
  await expect(page.getByRole("heading", { level: 1, name: "Record donations" })).toBeVisible();
  await expect(page.getByText(/Using the awardee list saved on this phone/)).toBeVisible();
  await expect(page.getByLabel("Who is it for?")).toHaveValue(/.+/);
  await record(page, "Offline Start", "10000");
  await expect(page.getByText("Offline. 1 saved on this phone, waiting to send.")).toBeVisible();

  // Starting the app at its home page offline offers the events that work offline.
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Record donations offline" })).toBeVisible();
  await page.getByRole("link", { name: /Offline Day/ }).click();
  await expect(page.getByRole("heading", { level: 1, name: "Record donations" })).toBeVisible();

  await context.setOffline(false);
  await expect(page.getByText("All donations sent.")).toBeVisible({ timeout: 90_000 });
  expect(await serverDonations(request, eventId, admin.headers)).toEqual(["Offline Start"]);
});
