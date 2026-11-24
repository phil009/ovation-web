import { randomUUID } from "node:crypto";
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
  const email = uniqueEmail("m2");
  const res = await request.post(`${API_URL}/api/auth/register`, {
    data: { name, email, password: PASSWORD },
    timeout: 120_000,
  });
  expect(res.ok(), await res.text()).toBeTruthy();
  const { accessToken, user } = (await res.json()) as {
    accessToken: string;
    user: { id: string };
  };
  return { email, userId: user.id, headers: { Authorization: `Bearer ${accessToken}` } };
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

/** An admin with an organisation, and a second member who joined with a code. */
async function seedOrgWithMember(request: APIRequestContext) {
  const admin = await register(request, "Ada Admin");
  const orgName = `E2E M2 Union ${Date.now()}`;
  const org = await request.post(`${API_URL}/api/orgs`, {
    headers: admin.headers,
    data: { name: orgName },
  });
  expect(org.ok(), await org.text()).toBeTruthy();
  const { id: orgId } = (await org.json()) as { id: string };

  const invite = await request.post(`${API_URL}/api/orgs/${orgId}/invites`, {
    headers: admin.headers,
    data: { role: "VIEWER", maxUses: 1, expiresInDays: 1 },
  });
  const { code } = (await invite.json()) as { code: string };
  const member = await register(request, "Obi Member");
  const accept = await request.post(`${API_URL}/api/invites/accept`, {
    headers: member.headers,
    data: { code },
  });
  expect(accept.ok(), await accept.text()).toBeTruthy();
  return { admin, member, orgId, orgName };
}

test("admin: events, awardees, totals, close and reopen, invites, members, audit", async ({
  page,
  request,
}) => {
  const { admin, member, orgId, orgName } = await seedOrgWithMember(request);
  const eventName = `Anambra Day ${Date.now()}`;

  await signIn(page, admin.email);
  await page.goto(`/orgs/${orgId}`);
  await expect(page.getByRole("heading", { level: 1, name: "Events" })).toBeVisible();
  await expect(page.getByText("No events yet.")).toBeVisible();
  await expect(page.getByText("Your role here: Admin.")).toBeVisible();
  await checkAxeBothThemes(page);

  // The last admin cannot leave.
  await page.getByRole("button", { name: "Leave organisation" }).click();
  await page.getByRole("alertdialog").getByRole("button", { name: "Leave" }).click();
  await expect(page.getByText(/You are the only admin/)).toBeVisible();

  // Create an event
  await page.getByRole("link", { name: "New event" }).click();
  await expect(page.getByRole("heading", { level: 1, name: "New event" })).toBeFocused();
  await checkAxeBothThemes(page);
  await page.getByLabel("Event name").fill(eventName);
  await page.getByLabel(/^Date/).fill("2026-11-08");
  await page.getByRole("button", { name: "Create event" }).click();
  await expect(page.getByRole("heading", { level: 1, name: eventName })).toBeVisible();
  await expect(page.getByText("Sun, 8 November 2026")).toBeVisible();
  const eventId = /\/events\/([^/]+)$/.exec(page.url())?.[1];
  expect(eventId).toBeTruthy();

  // Add two awardees. The form gets ready for the next notebook number.
  await page.getByLabel("Number").fill("1");
  await page.getByLabel(/^Name/).fill("Chief Emeka Obi");
  await page.getByLabel("Their own donation (naira)").fill("3m");
  await expect(page.getByText("= ₦3,000,000")).toBeVisible();
  await page.getByRole("radio", { name: "Pledge" }).check();
  await page.getByRole("button", { name: "Add awardee" }).click();
  await expect(page.getByText("Chief Emeka Obi added.")).toBeVisible();
  await expect(page.getByLabel("Number")).toHaveValue("2");
  await expect(page.getByLabel(/^Name/)).toBeFocused();
  await expect(page.getByRole("radio", { name: "Pledge" })).toBeChecked();
  await page.getByLabel(/^Name/).fill("Lolo Ada");
  await page.getByRole("radio", { name: "Cash" }).check();
  await page.getByRole("button", { name: "Add awardee" }).click();
  await expect(page.getByText("Lolo Ada added.")).toBeVisible();

  const table = page.getByRole("table", { name: `Totals for ${eventName}, by awardee` });
  await expect(table.getByRole("rowheader", { name: "Chief Emeka Obi" })).toBeVisible();
  await expect(table.getByRole("rowheader", { name: "Lolo Ada" })).toBeVisible();
  await expect(table.getByText("3,000,000 naira").first()).toBeAttached();

  // A supporter donation (recorded through the API until M3 builds the entry screen).
  const awardees = (await (
    await request.get(`${API_URL}/api/events/${eventId}/awardees`, { headers: admin.headers })
  ).json()) as { id: string; name: string }[];
  const lolo = awardees.find((a) => a.name === "Lolo Ada")!;
  const donation = await request.post(`${API_URL}/api/donations`, {
    headers: admin.headers,
    data: {
      id: randomUUID(),
      eventId,
      awardeeId: lolo.id,
      donorName: "Mrs Ngozi Okafor",
      amountKobo: "5000000",
      paymentMode: "TRANSFER",
    },
  });
  expect(donation.ok(), await donation.text()).toBeTruthy();
  await page.reload();
  await expect(table.getByText("1 supporter")).toBeVisible();
  await expect(page.getByText("Still pledged")).toBeVisible();
  await checkAxeBothThemes(page);

  // Edit Chief Emeka Obi's own donation.
  await page.getByRole("link", { name: "Edit Chief Emeka Obi" }).click();
  await expect(page.getByRole("heading", { level: 1, name: "Edit awardee" })).toBeVisible();
  await expect(page.getByLabel("Their own donation (naira)")).toHaveValue("3000000");
  await checkAxeBothThemes(page);
  await page.getByLabel("Their own donation (naira)").fill("500k");
  await page.getByRole("button", { name: "Save changes" }).click();
  await expect(page.getByRole("heading", { level: 1, name: eventName })).toBeVisible();
  await expect(table.getByText("500,000 naira").first()).toBeAttached();

  // An awardee with donations cannot be deleted.
  await page.getByRole("button", { name: "Delete Lolo Ada" }).click();
  await page.getByRole("alertdialog").getByRole("button", { name: "Delete" }).click();
  await expect(page.getByText(/still has donations/)).toBeVisible();
  // One without can.
  await page.getByRole("button", { name: "Delete Chief Emeka Obi" }).click();
  await page.getByRole("alertdialog").getByRole("button", { name: "Delete" }).click();
  await expect(page.getByText("Chief Emeka Obi deleted.")).toBeVisible();
  await expect(table.getByRole("rowheader", { name: "Chief Emeka Obi" })).toHaveCount(0);

  // Close, then reopen
  await page.getByRole("button", { name: "Close event" }).click();
  await page.getByRole("alertdialog").getByRole("button", { name: "Close event" }).click();
  await expect(page.getByText(/This event is closed/)).toBeVisible();
  await expect(page.getByRole("button", { name: "Add awardee" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: /^Delete / })).toHaveCount(0);
  await checkAxeBothThemes(page);
  await page.getByRole("button", { name: "Reopen event" }).click();
  await page.getByRole("alertdialog").getByRole("button", { name: "Reopen" }).click();
  await expect(page.getByRole("button", { name: "Add awardee" })).toBeVisible();

  // The events list shows it.
  await page.getByRole("link", { name: "All events" }).click();
  await expect(page.getByRole("link", { name: new RegExp(eventName) })).toBeVisible();

  // Invite codes
  const nav = page.getByRole("navigation", { name: "Organisation" });
  await nav.getByRole("link", { name: "Invite codes" }).click();
  await expect(page.getByRole("heading", { level: 1, name: "Invite codes" })).toBeVisible();
  await checkAxeBothThemes(page);
  await page.getByRole("radio", { name: "Viewer" }).check();
  await page.getByLabel("How many people can use it").fill("2");
  await page.getByRole("button", { name: "Create code" }).click();
  const newCode = page.getByRole("heading", { name: "New invite code" });
  await expect(newCode).toBeFocused();
  const code = (await page.locator("p.font-mono").first().textContent())?.trim() ?? "";
  expect(code).toMatch(/^OVN-/);
  const share = page.getByRole("link", { name: /Share on WhatsApp/ });
  await expect(share).toHaveAttribute("href", new RegExp(`^https://wa\\.me/\\?text=.*${code}`));
  await expect(share).toHaveAttribute("rel", "noopener noreferrer");
  await expect(page.getByText("Used 0 of 2")).toBeVisible();
  await checkAxeBothThemes(page);
  await page.getByRole("button", { name: `Revoke ${code}` }).click();
  await page.getByRole("alertdialog").getByRole("button", { name: "Revoke" }).click();
  await expect(page.getByText(`${code} revoked.`)).toBeVisible();
  await expect(page.getByRole("button", { name: `Revoke ${code}` })).toHaveCount(0);

  // Members: promote, then remove, the other member. The last admin cannot step down.
  await nav.getByRole("link", { name: "Members" }).click();
  await expect(page.getByRole("heading", { level: 1, name: "Members" })).toBeVisible();
  await expect(page.getByText("Obi Member", { exact: true })).toBeVisible();
  await checkAxeBothThemes(page);
  await page.getByLabel("Role for Ada Admin").selectOption("VIEWER");
  await page.getByRole("button", { name: "Change role" }).first().click();
  await expect(page.getByText(/at least one admin/)).toBeVisible();
  await expect(page.getByLabel("Role for Ada Admin")).toHaveValue("ADMIN");
  await page.getByLabel("Role for Obi Member").selectOption("EDITOR");
  await page
    .getByRole("listitem")
    .filter({ hasText: "Obi Member" })
    .getByRole("button", { name: "Change role" })
    .click();
  await expect(page.getByText("Obi Member is now Editor.")).toBeVisible();
  await page.getByRole("button", { name: "Remove Obi Member" }).click();
  await page.getByRole("alertdialog").getByRole("button", { name: "Remove" }).click();
  await expect(page.getByText("Obi Member removed.")).toBeVisible();
  await expect(page.getByLabel("Role for Obi Member")).toHaveCount(0);
  const gone = await request.get(`${API_URL}/api/orgs/${orgId}`, { headers: member.headers });
  expect(gone.status()).toBe(404);

  // Audit log
  await nav.getByRole("link", { name: "Audit log" }).click();
  await expect(page.getByRole("heading", { level: 1, name: "Audit log" })).toBeVisible();
  await expect(page.getByRole("table", { name: "Changes, newest first" })).toBeVisible();
  await page.getByLabel("What changed").selectOption("Event");
  await page.getByRole("button", { name: "Show", exact: true }).click();
  await expect(page.getByText(/Showing 1 to \d+ of \d+/)).toBeVisible();
  const rows = page.getByRole("table").getByRole("row");
  await expect(rows.filter({ hasText: "Membership" })).toHaveCount(0);
  await rows
    .nth(1)
    .getByText(/Show details/)
    .click();
  await expect(page.getByText("closed", { exact: true }).first()).toBeVisible();
  await checkAxeBothThemes(page);
  expect(orgName).toBeTruthy();
});

test("viewer: reads events and totals, no write controls", async ({ page, request }) => {
  const { admin, member, orgId } = await seedOrgWithMember(request);
  const event = await request.post(`${API_URL}/api/orgs/${orgId}/events`, {
    headers: admin.headers,
    data: { name: "Thanksgiving", date: "2026-12-06" },
  });
  const { id: eventId } = (await event.json()) as { id: string };
  await request.post(`${API_URL}/api/events/${eventId}/awardees`, {
    headers: admin.headers,
    data: { name: "Chief Emeka Obi", number: 1, amountKobo: "100000000", paymentMode: "CASH" },
  });

  await signIn(page, member.email);
  await page.goto(`/orgs/${orgId}`);
  await expect(page.getByRole("heading", { level: 1, name: "Events" })).toBeVisible();
  await expect(page.getByRole("link", { name: "New event" })).toHaveCount(0);
  await expect(page.getByRole("navigation", { name: "Organisation" })).toHaveCount(0);
  await page.getByRole("link", { name: /Thanksgiving/ }).click();
  await expect(page.getByRole("heading", { level: 1, name: "Thanksgiving" })).toBeVisible();
  await expect(page.getByRole("rowheader", { name: "Chief Emeka Obi" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Add awardee" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Close event" })).toHaveCount(0);
  await expect(page.getByRole("columnheader", { name: "Actions" })).toHaveCount(0);
  await checkAxeBothThemes(page);

  // Admin pages explain instead of failing.
  await page.goto(`/orgs/${orgId}/members`);
  await expect(page.getByText("Only admins of this organisation can see this page.")).toBeVisible();

  // An event id under the wrong organisation is "not found".
  await page.goto(`/orgs/${orgId}/events/00000000-0000-4000-8000-000000000000`);
  await expect(page.getByRole("heading", { level: 1, name: "Page not found" })).toBeVisible();
});
