import AxeBuilder from "@axe-core/playwright";
import { expect, type APIRequestContext, type Page } from "@playwright/test";

export const API_URL = process.env.E2E_API_URL?.replace(/\/+$/, "");

/** Collects CSP violations reported by the page (and CSP console errors). */
export function watchCsp(page: Page): string[] {
  const violations: string[] = [];
  page.on("console", (msg) => {
    if (msg.type() === "error" && /Content Security Policy/i.test(msg.text()))
      violations.push(msg.text());
  });
  void page.addInitScript(() => {
    document.addEventListener("securitypolicyviolation", (e) => {
      console.error(`Content Security Policy violation: ${e.violatedDirective} ${e.blockedURI}`);
    });
  });
  return violations;
}

/** Runs axe (WCAG 2.0-2.2 A and AA) and fails on any violation. */
export async function expectNoAxeViolations(page: Page) {
  const results = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"])
    .analyze();
  const summary = results.violations.map(
    (v) =>
      `${v.id} (${v.impact}): ${v.help}\n  ${v.nodes.map((n) => n.target.join(" ")).join("\n  ")}`,
  );
  expect(summary, summary.join("\n")).toEqual([]);
}

export function uniqueEmail(tag: string): string {
  return `e2e-${tag}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}@example.com`;
}

export const PASSWORD = "a-long-e2e-password";

/** Creates an account and an organisation through the API, and an invite code for it. */
export async function seedOrgWithInvite(
  request: APIRequestContext,
  role: "EDITOR" | "VIEWER" = "EDITOR",
) {
  if (!API_URL) throw new Error("E2E_API_URL is not set");
  const email = uniqueEmail("admin");
  const reg = await request.post(`${API_URL}/api/auth/register`, {
    data: { name: "E2E Admin", email, password: PASSWORD },
    timeout: 120_000,
  });
  expect(reg.ok(), await reg.text()).toBeTruthy();
  const { accessToken } = (await reg.json()) as { accessToken: string };
  const headers = { Authorization: `Bearer ${accessToken}` };

  const orgName = `E2E Union ${Date.now()}`;
  const org = await request.post(`${API_URL}/api/orgs`, { headers, data: { name: orgName } });
  expect(org.ok(), await org.text()).toBeTruthy();
  const { id: orgId } = (await org.json()) as { id: string };

  const invite = await request.post(`${API_URL}/api/orgs/${orgId}/invites`, {
    headers,
    data: { role, maxUses: 1, expiresInDays: 1 },
  });
  expect(invite.ok(), await invite.text()).toBeTruthy();
  const { code } = (await invite.json()) as { code: string };
  return { orgId, orgName, code };
}

/** WCAG 1.4.10 reflow: the page itself never scrolls sideways (wide tables scroll inside). */
export async function expectNoHorizontalScroll(page: Page) {
  const { scrollWidth, clientWidth } = await page.evaluate(() => ({
    scrollWidth: document.documentElement.scrollWidth,
    clientWidth: document.documentElement.clientWidth,
  }));
  expect(scrollWidth, "page scrolls sideways").toBeLessThanOrEqual(clientWidth);
}
