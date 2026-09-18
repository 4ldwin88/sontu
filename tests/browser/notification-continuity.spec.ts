import { test, expect, type Page } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";
import { randomUUID } from "node:crypto";

async function signIn(page: Page, email: string, password: string) {
  await page.goto("/#/sign-in");
  await page.getByLabel("Email", { exact: true }).fill(email);
  await page.getByLabel("Password", { exact: true }).fill(password);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Profile and appearance" }),
  ).toBeVisible();
}

test("cancelled events stay visible and create a durable unread notification", async ({
  page,
}) => {
  test.skip(
    !process.env.SONTU_TEST_SECONDARY_EMAIL,
    "Requires two isolated local Supabase accounts",
  );
  const host = createClient(
    process.env.SONTU_TEST_API!,
    process.env.SONTU_TEST_KEY!,
    { auth: { persistSession: false } },
  );
  const participant = createClient(
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
  expect(
    (
      await participant.auth.signInWithPassword({
        email: process.env.SONTU_TEST_SECONDARY_EMAIL!,
        password: process.env.SONTU_TEST_SECONDARY_PASSWORD!,
      })
    ).error,
  ).toBeNull();

  const title = `Cancellation continuity ${Date.now()}`;
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
    description: "Cancellation notification regression.",
    starts_at: "2031-03-14T22:00:00Z",
    ends_at: "2031-03-15T00:00:00Z",
    timezone: "America/Toronto",
    venue_label: "Continuity Hall",
    cover_key: "food",
  });
  expect(
    (
      await host.rpc("sontu_event_visibility", {
        action: "write",
        event_id: eventId,
        value: "PUBLIC",
      })
    ).error,
  ).toBeNull();
  await command("publish", { confirmed: true });

  const joined = await participant.rpc("sontu_public_event_participation", {
    event_id: eventId,
    action: "JOIN",
    expected_version: version,
    operation_id: randomUUID(),
  });
  expect(joined.error).toBeNull();
  expect(joined.data.status).toBe("ready");

  expect(
    (await participant.rpc("sontu_event_notification_state", { action: "mark_all" }))
      .error,
  ).toBeNull();
  const existingReplies = await participant.rpc(
    "sontu_event_question_notifications",
    { action: "read", question_id: null },
  );
  expect(existingReplies.error).toBeNull();
  for (const reply of existingReplies.data.items ?? []) {
    expect(
      (
        await participant.rpc("sontu_event_question_notifications", {
          action: "mark_seen",
          question_id: reply.id,
        })
      ).error,
    ).toBeNull();
  }

  await signIn(
    page,
    process.env.SONTU_TEST_SECONDARY_EMAIL!,
    process.env.SONTU_TEST_SECONDARY_PASSWORD!,
  );
  await page.getByRole("button", { name: "Notifications", exact: true }).click();
  await expect(page.getByRole("dialog", { name: "Notifications" })).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(
    page
      .getByRole("button", { name: "Notifications", exact: true })
      .locator(".notification-dot"),
  ).toHaveCount(0);

  await command("cancel", { confirmed: true });
  await page.reload();
  const notificationButton = page.getByRole("button", {
    name: "Notifications",
    exact: true,
  });
  await expect(notificationButton.locator(".notification-dot")).toBeVisible();
  await notificationButton.click();
  const drawer = page.getByRole("dialog", { name: "Notifications" });
  await expect(drawer.getByText(`${title} was cancelled`, { exact: true })).toBeVisible();
  await expect(notificationButton.locator(".notification-dot")).toHaveCount(0);
  await page.keyboard.press("Escape");

  await page.goto("/#/events?view=History");
  await expect(
    page.getByRole("link").filter({ hasText: title }),
  ).toBeVisible();
});
