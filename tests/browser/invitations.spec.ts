import { test, expect } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";
import { randomUUID, randomBytes } from "node:crypto";
import AxeBuilder from "@axe-core/playwright";
test("verified invitee accepts and reconfirms through connected Events", async ({
  page,
  browser,
  request,
}, info) => {
  test.skip(
    !process.env.SONTU_TEST_PASSWORD,
    "Requires isolated Auth and local mail capture",
  );
  test.setTimeout(120000);
  const client = createClient(
    process.env.SONTU_TEST_API!,
    process.env.SONTU_TEST_KEY!,
    { auth: { persistSession: false } },
  );
  expect(
    (
      await client.auth.signInWithPassword({
        email: process.env.SONTU_TEST_EMAIL!,
        password: process.env.SONTU_TEST_PASSWORD!,
      })
    ).error,
  ).toBeNull();
  let id: string | null = null,
    version = 1;
  async function cmd(cmd: string, input: Record<string, unknown> = {}) {
    const r = await client.rpc("sontu_host_command", {
      cmd,
      event_id: id,
      expected_version: version,
      operation_id: randomUUID(),
      input,
    });
    expect(r.error).toBeNull();
    expect(r.data.status).toBe("ready");
    id = r.data.event_id;
    version = r.data.current_version;
    return r.data;
  }
  await cmd("create_draft", { timezone: "Asia/Ho_Chi_Minh" });
  await cmd("save_draft", {
    title: `Invitation dinner ${info.project.name}`,
    description: "A protected private gathering.",
    starts_at: "2030-09-16T23:00:00Z",
    ends_at: "2030-09-17T01:00:00Z",
    timezone: "Asia/Ho_Chi_Minh",
    venue_label: "Private garden",
    cover_key: "food",
    capacity: "2",
  });
  await cmd("publish", { confirmed: true });
  const email = `invited-${info.project.name}@sontu.example`,
    token = randomBytes(32).toString("hex");
  await cmd("invite_participant", {
    display_name: "Invited guest",
    email,
    token,
  });
  await page.goto("/#/invite/" + token);
  await expect(
    page.getByRole("heading", { name: "Verify your invitation" }),
  ).toBeVisible();
  await expect(page.getByText("Private garden")).toHaveCount(0);
  await page.getByLabel("Invited email").fill(email);
  await page.getByRole("button", { name: "Email me a code" }).click();
  await expect(page.getByLabel("Verification code")).toBeVisible();
  let mailId = "";
  await expect
    .poll(
      async () => {
        const r = await request.get(
          process.env.SONTU_TEST_MAIL_URL! + "/api/v1/messages",
        );
        const data = await r.json();
        mailId =
          data.messages?.find((m: { ID: string; To: { Address: string }[] }) =>
            m.To?.some((t) => t.Address === email),
          )?.ID ?? "";
        return mailId;
      },
      { timeout: 15000 },
    )
    .not.toBe("");
  const mail = await (
    await request.get(
      process.env.SONTU_TEST_MAIL_URL! + "/api/v1/message/" + mailId,
    )
  ).json();
  const code = (mail.Text ?? mail.HTML).match(/\b\d{6}\b/)[0];
  await page.getByLabel("Verification code").fill("000000");
  await page.getByRole("button", { name: "Verify email", exact: true }).click();
  await expect(
    page.getByText("That code could not be verified.", { exact: false }),
  ).toBeVisible();
  await page.getByLabel("Verification code").fill(code);
  await page.getByRole("button", { name: "Verify email", exact: true }).click();
  await expect(
    page.getByRole("heading", {
      name: `Invitation dinner ${info.project.name}`,
    }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Accept invitation" }),
  ).toBeVisible();
  await page.getByRole("link", { name: "Your Events" }).click();
  await page.getByLabel("First name", { exact: true }).fill("Invited guest");
  await page.getByRole("button", { name: "Start exploring" }).click();
  await page.getByRole("tab", { name: "Invited", exact: true }).click();
  await page
    .getByRole("link")
    .filter({
      has: page.getByRole("heading", {
        name: `Invitation dinner ${info.project.name}`,
      }),
    })
    .click();
  await page.getByRole("button", { name: "Accept invitation" }).click();
  await expect(page.getByText("You’re going.", { exact: true })).toBeVisible();
  await page.getByRole("link", { name: "Your Events" }).click();
  await page.getByRole("tab", { name: "Upcoming", exact: true }).click();
  await expect(
    page.getByRole("heading", {
      name: `Invitation dinner ${info.project.name}`,
    }),
  ).toBeVisible();
  await page.screenshot({
    path: info.outputPath("connected-upcoming.png"),
    fullPage: true,
  });
  await cmd("change_time", {
    confirmed: true,
    starts_at: "2030-09-16T23:30:00Z",
  });
  await cmd("accept", { confirmed: true });
  await page.goto("/#/invite/" + token);
  await page.getByRole("button", { name: "I can still make it" }).click();
  await expect(page.getByText("You’re going.", { exact: true })).toBeVisible();
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
  const projection = await client.rpc("sontu_host_projection", {
    event_id: id,
  });
  expect(projection.data.data.cases[0].disposition).toBe("RESOLVED");
  const forwarded = await browser.newContext();
  const other = await forwarded.newPage();
  await other.goto("http://127.0.0.1:4173/#/invite/" + token);
  await expect(
    other.getByRole("heading", { name: "Verify your invitation" }),
  ).toBeVisible();
  await expect(other.getByText("Private garden")).toHaveCount(0);
  await forwarded.close();
  await cmd("revoke_link", {
    participant_id: projection.data.data.participants[0].id,
  });
  await page.reload();
  await expect(
    page.getByRole("heading", { name: "Invitation unavailable" }),
  ).toBeVisible();
  await expect(page.getByText("Private garden")).toHaveCount(0);
});
