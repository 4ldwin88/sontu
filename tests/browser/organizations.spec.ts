import { expect, test, type Page } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";
import { randomUUID } from "node:crypto";

const enabled =
  !!process.env.SONTU_TEST_PASSWORD &&
  !!process.env.SONTU_TEST_SECONDARY_EMAIL;

async function signIn(page: Page, email: string, password: string) {
  await page.goto("/#/sign-in");
  await page.getByLabel("Email", { exact: true }).fill(email);
  await page.getByLabel("Password", { exact: true }).fill(password);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Profile and appearance" }),
  ).toBeVisible();
}

test("organization continuity and event team changes persist across accounts", async ({
  page,
  browser,
}, info) => {
  test.skip(!enabled, "Requires two isolated local Supabase accounts");
  test.setTimeout(120000);
  const email = process.env.SONTU_TEST_EMAIL!;
  const password = process.env.SONTU_TEST_PASSWORD!;
  const secondaryEmail = process.env.SONTU_TEST_SECONDARY_EMAIL!;
  const secondaryPassword = process.env.SONTU_TEST_SECONDARY_PASSWORD!;
  const organizationName = `Browser organization ${Date.now()}`;

  await signIn(page, email, password);
  await page.goto("/#/organizations/new");
  await page.getByLabel("Organization name", { exact: true }).fill(organizationName);
  await page
    .getByRole("combobox", { name: "Organization type", exact: true })
    .selectOption("COMMUNITY");
  await page
    .getByLabel("Short description (optional)", { exact: true })
    .fill("Local browser continuity validation.");
  await page.getByLabel("Successor account email", { exact: true }).fill(secondaryEmail);
  await page
    .getByRole("button", { name: "Save organization setup", exact: true })
    .click();
  await expect(
    page.getByText(
      "Organization saved. It activates after the nominated successor accepts.",
      { exact: true },
    ),
  ).toBeVisible();
  await expect(page.getByText(organizationName, { exact: true }).first()).toBeVisible();

  const secondaryContext = await browser.newContext();
  const secondary = await secondaryContext.newPage();
  await signIn(secondary, secondaryEmail, secondaryPassword);
  await secondary.goto("/#/organizations");
  await expect(
    secondary.getByRole("heading", { name: "Successor requests", exact: true }),
  ).toBeVisible();
  const successorRequest = secondary
    .getByRole("article")
    .filter({ hasText: organizationName });
  await expect(successorRequest).toBeVisible();
  await successorRequest.getByRole("button", { name: "Accept", exact: true }).click();
  await expect(
    secondary.getByText("Successor designation accepted. You are now an organization member; ownership has not transferred.", {
      exact: true,
    }),
  ).toBeVisible();
  await secondaryContext.close();

  await page.reload();
  await expect(page.getByText("Active · Private identity", { exact: true })).toBeVisible();
  const memberCard = page
    .getByRole("article")
    .filter({ hasText: secondaryEmail })
    .filter({ hasText: "Member" });
  await expect(memberCard.getByText("Second tester", { exact: true })).toBeVisible();
  await page.goto("/#/discover");
  await page.getByLabel("Search events and people", { exact: true }).fill("Second tester");
  const peopleResults = page.getByRole("region", { name: "People results" });
  const personResult = peopleResults.getByRole("link").filter({ hasText: "Second tester" }).first();
  await expect(personResult).toBeVisible();
  await personResult.click();
  await expect(page.getByRole("heading", { name: "Second tester", exact: true })).toBeVisible();

  const api = createClient(
    process.env.SONTU_TEST_API!,
    process.env.SONTU_TEST_KEY!,
    { auth: { persistSession: false } },
  );
  const login = await api.auth.signInWithPassword({ email, password });
  expect(login.error).toBeNull();
  const overview = await api.rpc("sontu_organization_governance", {
    action: "overview",
    organization_id: null,
    input: {},
    operation_id: null,
  });
  expect(overview.error).toBeNull();
  const ownedOrganization = overview.data.organizations.find(
    (organization: { display_name: string }) =>
      organization.display_name === organizationName,
  );
  expect(ownedOrganization).toBeTruthy();
  const fixture = await api.rpc("sontu_host_command", {
    cmd: "create_fixture",
    event_id: null,
    expected_version: 1,
    operation_id: randomUUID(),
    input: {},
  });
  expect(fixture.error).toBeNull();
  expect(fixture.data.status).toBe("ready");
  const owner = await api.rpc("sontu_event_owner", {
    event_id: fixture.data.event_id,
    owner_kind: "ORGANIZATION",
    organization_id: ownedOrganization.id,
  });
  expect(owner.error).toBeNull();
  expect(owner.data.status).toBe("ready");

  await page.goto(`/#/core/events/${fixture.data.event_id}/host`);
  const categories = page
    .getByRole("navigation", { name: "Event workspace categories" })
    .filter({ visible: true });
  const tools = page
    .getByRole("navigation", { name: "Current workspace tools" })
    .filter({ visible: true });
  await categories.getByRole("button", { name: "People", exact: true }).click();
  await tools.getByRole("button", { name: "Team", exact: true }).click();
  const teammate = page.getByRole("combobox", {
    name: new RegExp(`${organizationName} member`),
  });
  await expect(teammate).toBeVisible();
  await teammate.selectOption(secondaryEmail);
  await page
    .getByRole("combobox", { name: "Role", exact: true })
    .selectOption("VOLUNTEER");
  await page.getByRole("button", { name: "Add teammate", exact: true }).click();
  await expect(page.getByText("Second tester", { exact: true })).toBeVisible();
  await expect(page.getByText(secondaryEmail, { exact: true })).toBeVisible();
  await page.reload();
  await categories.getByRole("button", { name: "People", exact: true }).click();
  await tools.getByRole("button", { name: "Team", exact: true }).click();
  await expect(page.getByText("Second tester", { exact: true })).toBeVisible();

  await page.screenshot({
    path: info.outputPath("organization-team.png"),
    animations: "disabled",
    fullPage: true,
  });
});
