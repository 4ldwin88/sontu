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

test("protected online access follows confirmed participation", async ({
  page,
  browser,
}, info) => {
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
  const title = `Protected session ${info.project.name} ${Date.now()}`;
  const secret = `https://meet.sontu.local/${randomUUID()} passcode 2468`;
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
  const intent = await host.rpc("sontu_set_event_intent", {
    event_id: eventId,
    event_category: "Networking",
    event_format: "online",
  });
  expect(intent.error).toBeNull();
  expect(intent.data.status).toBe("ready");
  await command("save_draft", {
    title,
    description: "Protected access browser validation.",
    starts_at: "2030-12-10T22:00:00Z",
    ends_at: "2030-12-11T00:00:00Z",
    timezone: "America/Toronto",
    venue_label: "Online access shared after RSVP",
    cover_key: "market",
    capacity: "8",
  });
  const visibility = await host.rpc("sontu_event_visibility", {
    action: "write",
    event_id: eventId,
    value: "PUBLIC",
  });
  expect(visibility.error).toBeNull();
  expect(visibility.data.status).toBe("ready");
  await command("publish", { confirmed: true });

  await signIn(page, process.env.SONTU_TEST_EMAIL!, process.env.SONTU_TEST_PASSWORD!);
  await page.goto(`/#/core/events/${eventId}/host`);
  const accessPanel = page.locator("section", {
    has: page.getByRole("heading", { name: "Join details", exact: true }),
  });
  await accessPanel.getByLabel("Private online access", { exact: true }).fill(secret);
  await accessPanel.getByRole("button", { name: "Save", exact: true }).click();
  await expect(page.getByText("Protected join details saved.", { exact: true })).toBeVisible();
  await page.reload();
  await expect(
    page.getByRole("textbox", { name: "Private online access", exact: true }),
  ).toHaveValue(secret);

  const anonymousContext = await browser.newContext();
  const anonymous = await anonymousContext.newPage();
  await anonymous.goto(`http://127.0.0.1:4173/#/event/${eventId}`);
  await expect(anonymous.getByText("Join details protected", { exact: true })).toBeVisible();
  await expect(anonymous.getByText(secret, { exact: true })).toHaveCount(0);

  const participantContext = await browser.newContext();
  const participant = await participantContext.newPage();
  await signIn(
    participant,
    process.env.SONTU_TEST_SECONDARY_EMAIL!,
    process.env.SONTU_TEST_SECONDARY_PASSWORD!,
  );
  await participant.goto(`http://127.0.0.1:4173/#/event/${eventId}`);
  await expect(participant.getByText(secret, { exact: true })).toHaveCount(0);
  await participant
    .getByRole("button", { name: "Going", exact: true })
    .filter({ visible: true })
    .click();
  await expect(participant.getByText(secret, { exact: true })).toBeVisible();
  await participant
    .getByRole("navigation", { name: "Event actions" })
    .getByRole("link", { name: "View RSVP", exact: true })
    .click();
  const question = `Is parking available ${randomUUID().slice(0, 8)}?`;
  const accommodation = `Need an aisle seat ${randomUUID().slice(0, 8)}.`;
  await participant.getByLabel("Your question", { exact: true }).fill(question);
  await participant.getByRole("button", { name: "Send question", exact: true }).click();
  await expect(
    participant.getByText("Your question was sent to the host.", { exact: true }),
  ).toBeVisible();
  await participant.getByLabel("Your request", { exact: true }).fill(accommodation);
  await participant.getByRole("button", { name: "Save request", exact: true }).click();
  await expect(participant.getByText("Saved", { exact: true })).toBeVisible();

  const categories = page
    .getByRole("navigation", { name: "Event workspace categories" })
    .filter({ visible: true });
  const tools = page
    .getByRole("navigation", { name: "Current workspace tools" })
    .filter({ visible: true });
  await categories.getByRole("button", { name: "People", exact: true }).click();
  await tools.getByRole("button", { name: "Accommodations", exact: true }).click();
  await expect(page.getByText(accommodation, { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Mark acknowledged", exact: true }).click();
  await expect(page.getByText("Acknowledged", { exact: true })).toBeVisible();
  await categories
    .getByRole("button", { name: "Communications", exact: true })
    .click();
  await tools.getByRole("button", { name: "Questions", exact: true }).click();
  await expect(page.getByText(question, { exact: true })).toBeVisible();
  await page.getByLabel("Response", { exact: true }).fill("Yes, parking is available.");
  await page.getByRole("button", { name: "Send response", exact: true }).click();
  await expect(page.getByText("Answered", { exact: true })).toBeVisible();
  await expect(page.getByText("Yes, parking is available.")).toBeVisible();
  await participant.reload();
  await expect(participant.getByText("Yes, parking is available.")).toBeVisible();

  const leave = participant.getByRole("button", { name: "Leave event", exact: true });
  participant.once("dialog", (dialog) => void dialog.accept());
  await leave.click();
  await expect(
    participant
      .getByRole("button", { name: "Going", exact: true })
      .filter({ visible: true }),
  ).toBeVisible();
  await expect(participant.getByText("Join details protected", { exact: true })).toBeVisible();
  await expect(participant.getByText(secret, { exact: true })).toHaveCount(0);
  await participant.goto(`http://127.0.0.1:4173/#/event/${eventId}`);
  await expect(participant.getByText("Join details protected", { exact: true })).toBeVisible();
  await expect(participant.getByText(secret, { exact: true })).toHaveCount(0);

  await anonymousContext.close();
  await participantContext.close();
});
