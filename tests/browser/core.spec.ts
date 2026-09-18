import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { createClient } from "@supabase/supabase-js";
import { randomUUID, randomBytes } from "node:crypto";
const enabled = !!process.env.SONTU_TEST_PASSWORD;
async function createValidationFixture(api: ReturnType<typeof createClient>) {
  const result = await api.rpc("sontu_host_command", {
    cmd: "create_fixture",
    event_id: null,
    expected_version: 1,
    operation_id: randomUUID(),
    input: {},
  });
  expect(result.error).toBeNull();
  expect(result.data.status).toBe("ready");
  return result.data.event_id as string;
}
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
  // Browser-only setup remains API-level so the production host UI contains no
  // synthetic-event control. The workflow itself continues through real UI.
  const eventId = await createValidationFixture(api);
  await page.goto(`/#/core/events/${eventId}/host`);
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
  // UTC browser edits Toronto wall time; preserve the intended instant.
  await page
    .getByLabel("New start time (event time zone)")
    .fill("2026-09-16T19:30");
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
  const categories = page
    .getByRole("navigation", { name: "Event workspace categories" })
    .filter({ visible: true });
  const tools = page
    .getByRole("navigation", { name: "Current workspace tools" })
    .filter({ visible: true });
  await categories.getByRole("button", { name: "People", exact: true }).click();
  await tools.getByRole("button", { name: "Participants", exact: true }).click();
  await page
    .getByRole("button", { name: "Issue private link for Guest 12", exact: true })
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
    guest.getByText("You have reconfirmed for these event details."),
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
  await categories.getByRole("button", { name: "Overview", exact: true }).click();
  await page.getByRole("button", { name: "Refresh status" }).click();
  await expect(page.getByText("12 / 12", { exact: true })).toBeVisible();
  await expect(page.getByText("Resolved", { exact: true })).toBeVisible();
  // Reload verifies durable state through the real session and backend.
  await page.reload();
  await expect(page.getByText("12 / 12", { exact: true })).toBeVisible();
  await categories.getByRole("button", { name: "People", exact: true }).click();
  await tools.getByRole("button", { name: "Participants", exact: true }).click();
  await expect(page.getByText("Admission: Valid").first()).toBeVisible();

  await categories.getByRole("button", { name: "Insights", exact: true }).click();
  await tools.getByRole("button", { name: "Analytics", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Analytics", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByText(
      "Counts come directly from RSVPs, invitations, delivery records, admissions and check-ins. No estimated reach or fabricated conversion data.",
      { exact: true },
    ),
  ).toBeVisible();
  const analytics = await api.rpc("sontu_host_operational_analytics", {
    event_id: eventId,
  });
  expect(analytics.error).toBeNull();
  expect(analytics.data.status).toBe("ready");
  expect(analytics.data.admissions.valid).toBeGreaterThan(0);
  expect(analytics.data.check_in.checked_in).toBe(0);
  await categories.getByRole("button", { name: "Communications", exact: true }).click();
  await tools.getByRole("button", { name: "Assistant", exact: true }).click();
  await expect(
    page.getByText(
      "This workspace can draft, summarize and flag. It cannot publish, message guests, charge, refund, change access, or settle obligations.",
      { exact: true },
    ),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Draft event reminder", exact: true })
    .click();
  await expect(page.getByLabel("Editable draft")).toBeVisible();
  await expect(page.getByText("Nothing is sent automatically.")).toBeVisible();
  await categories.getByRole("button", { name: "Overview", exact: true }).click();
  await page.getByRole("button", { name: "Change start time" }).click();
  await page
    .getByLabel("New start time (event time zone)")
    .fill("2026-09-16T20:00");
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
  await categories.getByRole("button", { name: "Communications", exact: true }).click();
  await tools.getByRole("button", { name: "Assistant", exact: true }).click();
  await expect(
    page.getByText(
      "This event is cancelled. Do not send reminders or make access assumptions.",
      { exact: true },
    ),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Draft event reminder", exact: true }),
  ).toBeDisabled();
  const cancelled = await api.rpc("sontu_host_projection", {
    event_id: eventId,
  });
  expect(cancelled.error).toBeNull();
  expect(cancelled.data.data.admission_summary.valid).toBe(0);
  expect(cancelled.data.data.admission_summary.used).toBe(0);
  expect(cancelled.data.data.admission_summary.invalid).toBeGreaterThan(0);
  expect(
    cancelled.data.data.participants
      .filter((participant: { admission_status: string | null }) =>
        Boolean(participant.admission_status),
      )
      .every(
        (participant: { admission_status: string }) =>
          participant.admission_status === "CANCELLED_EVENT_INVALID",
      ),
  ).toBe(true);
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

test("admission status governs host check-in and cancellation", async ({
  page,
}) => {
  test.skip(!enabled, "Requires isolated Supabase test credentials");
  test.setTimeout(90000);
  const email = process.env.SONTU_TEST_EMAIL!;
  const password = process.env.SONTU_TEST_PASSWORD!;
  const api = createClient(
    process.env.SONTU_TEST_API!,
    process.env.SONTU_TEST_KEY!,
    { auth: { persistSession: false } },
  );
  expect(
    (await api.auth.signInWithPassword({ email, password })).error,
  ).toBeNull();
  await page.goto("/#/core");
  await page.getByLabel("Email", { exact: true }).fill(email);
  await page.getByLabel("Password", { exact: true }).fill(password);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(page.getByRole("button", { name: "Sign out", exact: true })).toBeVisible();
  const eventId = await createValidationFixture(api);
  const fixture = await api.rpc("sontu_host_projection", { event_id: eventId });
  const published = await api.rpc("sontu_host_command", {
    cmd: "publish",
    event_id: eventId,
    expected_version: fixture.data.data.event.current_version_number,
    operation_id: randomUUID(),
    input: { confirmed: true },
  });
  expect(published.error).toBeNull();
  expect(published.data.status).toBe("ready");

  const before = await api.rpc("sontu_host_projection", { event_id: eventId });
  expect(before.error).toBeNull();
  expect(before.data.data.admission_summary.valid).toBeGreaterThan(0);
  const started = await api.rpc("sontu_start_event", {
    event_id: eventId,
    operation_id: randomUUID(),
  });
  expect(started.error).toBeNull();
  expect(started.data.status).toBe("ready");

  await page.goto(`/#/core/events/${eventId}/check-in`);
  await expect(
    page.getByRole("heading", { name: "Check-in", exact: true }),
  ).toBeVisible();
  await expect(page.getByText("Valid admission").first()).toBeVisible();
  const checkIn = page
    .getByRole("button", { name: "Check in", exact: true })
    .first();
  await expect(checkIn).toBeEnabled();
  await checkIn.click();
  await expect(page.getByText(/^Admitted —/)).toBeVisible();
  const verifyAgain = page
    .getByRole("button", { name: "Verify again", exact: true })
    .first();
  await expect(verifyAgain).toBeEnabled();
  await verifyAgain.click();
  await expect(page.getByText(/^Already used —/)).toBeVisible();

  const afterCheckIn = await api.rpc("sontu_host_operational_analytics", {
    event_id: eventId,
  });
  expect(afterCheckIn.error).toBeNull();
  expect(afterCheckIn.data.check_in.checked_in).toBe(1);
  expect(afterCheckIn.data.admissions.used).toBe(1);

  const current = await api.rpc("sontu_host_projection", { event_id: eventId });
  const cancelled = await api.rpc("sontu_host_command", {
    cmd: "cancel",
    event_id: eventId,
    expected_version: current.data.data.event.current_version_number,
    operation_id: randomUUID(),
    input: { confirmed: true },
  });
  expect(cancelled.error).toBeNull();
  expect(cancelled.data.status).toBe("ready");
  await page.reload();
  await expect(page.getByText("Check-in is not open yet.")).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Verify again", exact: true }).first(),
  ).toBeDisabled();
  const finalProjection = await api.rpc("sontu_host_projection", {
    event_id: eventId,
  });
  expect(finalProjection.data.data.admission_summary.valid).toBe(0);
  expect(finalProjection.data.data.admission_summary.used).toBe(0);
  expect(finalProjection.data.data.admission_summary.invalid).toBeGreaterThan(
    0,
  );
});
