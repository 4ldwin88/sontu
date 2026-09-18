import { expect, test } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";
import { randomUUID } from "node:crypto";

test("Interested persists in Events and yields to Going", async ({ page }, info) => {
  test.skip(
    !process.env.SONTU_TEST_SECONDARY_EMAIL,
    "Requires two isolated local Supabase accounts",
  );
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
  const title = `Interested event ${info.project.name} ${Date.now()}`;
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
    description: "Interest filter browser validation.",
    starts_at: "2030-10-10T22:00:00Z",
    ends_at: "2030-10-11T00:00:00Z",
    timezone: "America/Toronto",
    venue_label: "Community room",
    cover_key: "music",
    capacity: "12",
  });
  const visibility = await host.rpc("sontu_event_visibility", {
    action: "write",
    event_id: eventId,
    value: "PUBLIC",
  });
  expect(visibility.error).toBeNull();
  expect(visibility.data.status).toBe("ready");
  await command("publish", { confirmed: true });

  await page.goto("/#/sign-in");
  await page
    .getByLabel("Email", { exact: true })
    .fill(process.env.SONTU_TEST_SECONDARY_EMAIL!);
  await page
    .getByLabel("Password", { exact: true })
    .fill(process.env.SONTU_TEST_SECONDARY_PASSWORD!);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Profile and appearance" }),
  ).toBeVisible();
  await page.goto(`/#/event/${eventId}`);
  await expect(page.getByRole("heading", { name: title, exact: true })).toBeVisible();
  const interest = page
    .getByRole("button", { name: "Interested", exact: true })
    .filter({ visible: true });
  await interest.click();
  await expect(interest).toHaveAttribute("aria-pressed", "true");

  await page.goto("/#/events?view=Interested");
  await expect(page.getByRole("tab", { name: "Interested", exact: true })).toHaveAttribute(
    "aria-selected",
    "true",
  );
  await expect(page.getByRole("heading", { name: title, exact: true })).toBeVisible();
  await page.getByRole("heading", { name: title, exact: true }).click();
  await page.getByRole("button", { name: "Going", exact: true }).filter({ visible: true }).click();
  await expect(
    page.getByRole("navigation", { name: "Event actions" }).getByText("Going", {
      exact: true,
    }),
  ).toBeVisible();

  await page.goto("/#/events?view=Interested");
  await expect(page.getByRole("heading", { name: title, exact: true })).toHaveCount(0);
  await page.getByRole("tab", { name: "Upcoming", exact: true }).click();
  await expect(page.getByRole("heading", { name: title, exact: true })).toBeVisible();
});
