import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { createClient } from "@supabase/supabase-js";
import { randomUUID, randomBytes } from "node:crypto";
const enabled = !!process.env.SONTU_TEST_PASSWORD;
test("authenticated host and scoped participants complete the core workflow", async ({
  page,
}, info) => {
  test.skip(!enabled, "Requires isolated Supabase test credentials");
  test.setTimeout(120000);
  const email = process.env.SONTU_TEST_EMAIL!,
    password = process.env.SONTU_TEST_PASSWORD!;
  const api = createClient(
    process.env.SONTU_TEST_API!,
    process.env.SONTU_TEST_KEY!,
    { auth: { persistSession: false } },
  );
  const login = await api.auth.signInWithPassword({ email, password });
  expect(login.error).toBeNull();
  await page.goto("/#/core");
  await page.getByLabel("Email", { exact: true }).fill(email);
  await page.getByLabel("Password", { exact: true }).fill(password);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Create test event", exact: true }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Create test event", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "Publish test event" }),
  ).toBeVisible();
  const eventId = page.url().match(/core\/events\/([^/]+)/)![1];
  await page.getByRole("button", { name: "Publish test event" }).click();
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Confirm", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "Change start time" }),
  ).toBeVisible();
  // Commit the command, then lose its HTTP response. Reload must retain the retry identity.
  let dropOnce = true;
  await page.route("**/rest/v1/rpc/sontu_host_command", async (route) => {
    if (dropOnce && route.request().postDataJSON()?.cmd === "change_time") {
      dropOnce = false;
      await route.fetch();
      await route.abort("failed");
    } else await route.continue();
  });
  await page.getByRole("button", { name: "Change start time" }).click();
  // CI browser's local zone is UTC; UI also previews the event's Toronto zone.
  await page
    .getByLabel("New start time (your time zone)")
    .fill("2026-09-16T23:30");
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Confirm", exact: true })
    .click();
  await expect(
    page.getByText("Outcome not confirmed", { exact: true }).first(),
  ).toBeVisible();
  await page.reload();
  await expect(
    page.getByRole("button", { name: "Retry same request", exact: true }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Retry same request", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "Require reconfirmation" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Require reconfirmation" }).click();
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Confirm", exact: true })
    .click();
  await expect(page.getByText("0 / 12", { exact: true })).toBeVisible();
  await page
    .getByText("Test provider and delivery outcomes", { exact: true })
    .click();
  await page
    .getByRole("button", { name: "Simulate delivered messages" })
    .click();
  await expect(page.getByText("12 delivered · simulated")).toBeVisible();
  await expect(page.getByText("0 / 12", { exact: true })).toBeVisible();
  const result = await api.rpc("sontu_host_projection", { event_id: eventId });
  expect(result.error).toBeNull();
  let version = result.data.data.event.current_version_number;
  const participants = result.data.data.participants;
  // Exercise every scoped response through the real RPC, then one through the rendered UI.
  for (let i = 0; i < 11; i++) {
    const token = randomBytes(32).toString("hex");
    const issued = await api.rpc("sontu_host_command", {
      cmd: "issue_link",
      event_id: eventId,
      expected_version: version,
      operation_id: randomUUID(),
      input: { participant_id: participants[i].id, token },
    });
    expect(issued.data.status).toBe("ready");
    const args = {
      token,
      decision: i === 10 ? "RELEASED_DECLINED" : "RECONFIRMED",
      expected_version: version,
      operation_id: randomUUID(),
    };
    const r = await api.rpc("sontu_participant_access", args);
    expect(r.data.status).toBe("ready");
    expect((await api.rpc("sontu_participant_access", args)).data).toEqual(
      r.data,
    );
  }
  await page.getByRole("button", { name: "Refresh status" }).click();
  await expect(page.getByText("11 / 12", { exact: true })).toBeVisible();
  await expect(
    page.getByText("Open unresolved", { exact: true }),
  ).toBeVisible();
  expect(
    (
      await new AxeBuilder({ page })
        .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
        .analyze()
    ).violations,
  ).toEqual([]);
  await page.screenshot({
    path: info.outputPath("core-partial.png"),
    fullPage: true,
  });
  const nav = page
    .getByRole("navigation", { name: "Event workspace modules" })
    .filter({ visible: true });
  await nav.getByRole("button", { name: "Participants", exact: true }).click();
  await page
    .getByRole("button", { name: "Response link for Guest 12", exact: true })
    .click();
  const dialog = page.getByRole("dialog");
  await expect(dialog).toBeVisible();
  const responseURL = await dialog
    .getByRole("link", { name: "Open participant response" })
    .getAttribute("href");
  const guest = await page.context().newPage();
  await guest.goto(responseURL!);
  await expect(
    guest.getByRole("heading", { name: "Hello, Guest 12." }),
  ).toBeVisible();
  await guest
    .getByRole("button", { name: "I can still make it", exact: true })
    .click();
  await expect(
    guest.getByText("You have reconfirmed for this time."),
  ).toBeVisible();
  expect(
    (
      await new AxeBuilder({ page: guest })
        .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
        .analyze()
    ).violations,
  ).toEqual([]);
  await guest.screenshot({
    path: info.outputPath("core-participant.png"),
    fullPage: true,
  });
  await guest.close();
  await dialog.getByRole("button", { name: "Done", exact: true }).click();
  await nav.getByRole("button", { name: "Overview", exact: true }).click();
  await page.getByRole("button", { name: "Refresh status" }).click();
  await expect(page.getByText("12 / 12", { exact: true })).toBeVisible();
  await expect(page.getByText("Resolved", { exact: true })).toBeVisible();
  // Reload verifies durable state through the real session and backend.
  await page.reload();
  await expect(page.getByText("12 / 12", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Change start time" }).click();
  await page
    .getByLabel("New start time (your time zone)")
    .fill("2026-09-17T00:00");
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Confirm", exact: true })
    .click();
  await expect(page.getByText("0 / 11", { exact: true })).toBeVisible();
  const stale = await api.rpc("sontu_host_command", {
    cmd: "cancel",
    event_id: eventId,
    expected_version: version,
    operation_id: randomUUID(),
    input: { confirmed: true },
  });
  expect(stale.data.error_code).toBe("STALE_CONFLICT");
  await page.getByRole("button", { name: "Cancel event", exact: true }).click();
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Confirm", exact: true })
    .click();
  await expect(
    page.getByText("This event is cancelled.", { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByText("Open unresolved", { exact: true }),
  ).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth + 1,
    ),
  ).toBe(true);
  await page.screenshot({
    path: info.outputPath("core-cancelled.png"),
    fullPage: true,
  });
});
