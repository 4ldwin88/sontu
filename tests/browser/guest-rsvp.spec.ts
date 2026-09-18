import { expect, test } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";
import { randomUUID } from "node:crypto";

test("signed-out guest RSVP persists and can be withdrawn from its private link", async ({
  page,
  browser,
}, info) => {
  test.skip(!process.env.SONTU_TEST_PASSWORD, "Requires isolated local Supabase credentials");
  test.setTimeout(90000);
  const host = createClient(
    process.env.SONTU_TEST_API!,
    process.env.SONTU_TEST_KEY!,
    { auth: { persistSession: false } },
  );
  expect(
    (
      await host.auth.signInWithPassword({
        email: process.env.SONTU_TEST_EMAIL!,
        password: process.env.SONTU_TEST_PASSWORD!,
      })
    ).error,
  ).toBeNull();
  const title = `Guest RSVP ${info.project.name} ${Date.now()}`;
  let eventId: string | null = null;
  let version = 1;
  async function command(cmd: string, input: Record<string, unknown> = {}) {
    const result = await host.rpc("sontu_host_command", {
      cmd,
      event_id: eventId,
      expected_version: version,
      operation_id: randomUUID(),
      input,
    });
    expect(result.error).toBeNull();
    expect(result.data.status).toBe("ready");
    eventId = result.data.event_id;
    version = result.data.current_version;
  }
  await command("create_draft", { timezone: "America/Toronto" });
  await command("save_draft", {
    title,
    description: "Guest RSVP browser validation.",
    starts_at: "2030-11-10T22:00:00Z",
    ends_at: "2030-11-11T00:00:00Z",
    timezone: "America/Toronto",
    venue_label: "Guest room",
    cover_key: "food",
    capacity: "1",
  });
  const visibility = await host.rpc("sontu_event_visibility", {
    action: "write",
    event_id: eventId,
    value: "PUBLIC",
  });
  expect(visibility.error).toBeNull();
  expect(visibility.data.status).toBe("ready");
  await command("publish", { confirmed: true });

  await page.goto(`/#/event/${eventId}`);
  await page.getByRole("button", { name: "RSVP", exact: true }).click();
  await page.getByRole("button", { name: "RSVP as a guest", exact: true }).click();
  await page.getByLabel("Your name", { exact: true }).fill("Browser Guest");
  await page
    .getByLabel("Email address", { exact: true })
    .fill(`guest-${Date.now()}@sontu.example`);
  await page.getByRole("button", { name: "Confirm RSVP", exact: true }).click();
  const actions = page.getByRole("navigation", { name: "Event actions" });
  await expect(actions.getByText("Going", { exact: true })).toBeVisible();

  const otherContext = await browser.newContext();
  const other = await otherContext.newPage();
  await other.goto(`http://127.0.0.1:4173/#/event/${eventId}`);
  await expect(
    other
      .getByRole("navigation", { name: "Event actions" })
      .getByRole("button", { name: "Event full", exact: true }),
  ).toBeDisabled();

  await page.reload();
  await expect(actions.getByText("Going", { exact: true })).toBeVisible();
  await actions.getByRole("link", { name: "Manage RSVP", exact: true }).click();
  await expect(page.getByRole("heading", { name: title, exact: true })).toBeVisible();
  await expect(page.getByText("Private guest RSVP link is open", { exact: true })).toBeVisible();
  page.once("dialog", (dialog) => void dialog.accept());
  await actions.getByRole("button", { name: "Leave event", exact: true }).click();
  await expect(actions.getByRole("button", { name: "RSVP", exact: true })).toBeVisible();
  await other.reload();
  await expect(
    other
      .getByRole("navigation", { name: "Event actions" })
      .getByRole("button", { name: "RSVP", exact: true }),
  ).toBeVisible();
  await otherContext.close();

  const projection = await host.rpc("sontu_host_projection", { event_id: eventId });
  expect(projection.error).toBeNull();
  const guest = projection.data.data.participants.find(
    (participant: { display_name: string }) => participant.display_name === "Browser Guest",
  );
  expect(guest.commitment_state).toBe("RELEASED_DECLINED");
  expect(projection.data.data.admission_summary.valid).toBe(0);
});
