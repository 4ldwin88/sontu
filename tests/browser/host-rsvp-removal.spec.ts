import { expect, test, type Page } from "@playwright/test";
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

test("host removes a public RSVP from the participant workspace", async ({
  page,
  browser,
}, info) => {
  test.skip(
    !process.env.SONTU_TEST_SECONDARY_EMAIL,
    "Requires two isolated local Supabase accounts",
  );
  test.setTimeout(90000);
  const api = createClient(
    process.env.SONTU_TEST_API!,
    process.env.SONTU_TEST_KEY!,
    { auth: { persistSession: false } },
  );
  expect(
    (
      await api.auth.signInWithPassword({
        email: process.env.SONTU_TEST_EMAIL!,
        password: process.env.SONTU_TEST_PASSWORD!,
      })
    ).error,
  ).toBeNull();
  const title = `Host removal ${info.project.name} ${Date.now()}`;
  let eventId: string | null = null;
  let version = 1;
  async function command(cmd: string, input: Record<string, unknown> = {}) {
    const result = await api.rpc("sontu_host_command", {
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
    description: "Host RSVP removal browser validation.",
    starts_at: "2031-01-10T22:00:00Z",
    ends_at: "2031-01-11T00:00:00Z",
    timezone: "America/Toronto",
    venue_label: "Community hall",
    cover_key: "food",
    capacity: "3",
  });
  const visibility = await api.rpc("sontu_event_visibility", {
    action: "write",
    event_id: eventId,
    value: "PUBLIC",
  });
  expect(visibility.error).toBeNull();
  expect(visibility.data.status).toBe("ready");
  await command("publish", { confirmed: true });

  const participantContext = await browser.newContext();
  const participant = await participantContext.newPage();
  await signIn(
    participant,
    process.env.SONTU_TEST_SECONDARY_EMAIL!,
    process.env.SONTU_TEST_SECONDARY_PASSWORD!,
  );
  async function join() {
    await participant.goto(
      `http://127.0.0.1:4173/#/event/${eventId}?refresh=${Date.now()}`,
    );
    await participant
      .getByRole("button", { name: "Going", exact: true })
      .filter({ visible: true })
      .click();
    await expect(
      participant
        .getByRole("navigation", { name: "Event actions" })
        .getByText("Going", { exact: true }),
    ).toBeVisible();
  }
  await join();

  await signIn(page, process.env.SONTU_TEST_EMAIL!, process.env.SONTU_TEST_PASSWORD!);
  await page.goto(`/#/my-events/${eventId}`);
  const goingList = page.locator("section", {
    has: page.getByRole("heading", { name: "Going", exact: true }),
  });
  await expect(goingList.getByText("Second tester", { exact: true })).toBeVisible();
  await expect(
    goingList.getByRole("button", { name: "Remove RSVP", exact: true }),
  ).toHaveCount(0);
  await page.goto(`/#/core/events/${eventId}/host`);
  const categories = page
    .getByRole("navigation", { name: "Event workspace categories" })
    .filter({ visible: true });
  const tools = page
    .getByRole("navigation", { name: "Current workspace tools" })
    .filter({ visible: true });
  await categories.getByRole("button", { name: "People", exact: true }).click();
  await tools.getByRole("button", { name: "Participants", exact: true }).click();
  const participantRow = page
    .getByRole("listitem")
    .filter({ hasText: "Second tester" });
  page.once("dialog", (dialog) => void dialog.accept());
  await participantRow
    .getByRole("button", { name: /Remove from Going/ })
    .click();
  await expect(participantRow.getByText("Released declined", { exact: false })).toBeVisible();
  const projection = await api.rpc("sontu_host_projection", { event_id: eventId });
  const member = projection.data.data.participants.find(
    (item: { display_name: string }) => item.display_name === "Second tester",
  );
  expect(member.commitment_state).toBe("RELEASED_DECLINED");
  expect(member.admission_status).not.toBe("VALID");

  await participantContext.close();
});
