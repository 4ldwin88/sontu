import { test, expect } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";
import { randomUUID, randomBytes } from "node:crypto";
import AxeBuilder from "@axe-core/playwright";

test("account portal registers, resumes minimum profile, and keeps real identity after sign-in", async ({
  page,
  request,
}, info) => {
  test.skip(!process.env.SONTU_TEST_API, "Requires isolated Auth");
  test.setTimeout(90000);
  const api = process.env.SONTU_TEST_API!;
  if (!/^http:\/\/(127\.0\.0\.1|localhost):/.test(api))
    throw Error("No hosted signup test");
  const email = `account-${info.project.name}@sontu.example`,
    password = "SontuBeta42!";
  const client = createClient(api, process.env.SONTU_TEST_KEY!, {
    auth: { persistSession: false },
  });
  // Direct API verifies the server policy, independently of the checklist.
  for (const weak of [
    "short",
    "lowercase42!",
    "UPPERCASE42!",
    "NoNumberHere!",
    "NoSymbolHere42",
  ]) {
    const { error } = await client.auth.signUp({ email, password: weak });
    expect(error?.code).toBe("weak_password");
  }
  const host = createClient(api, process.env.SONTU_TEST_KEY!, {
    auth: { persistSession: false },
  });
  await host.auth.signInWithPassword({
    email: process.env.SONTU_TEST_EMAIL!,
    password: process.env.SONTU_TEST_PASSWORD!,
  });
  let eventId: string | null = null,
    version = 1;
  async function command(cmd: string, input: Record<string, unknown> = {}) {
    const result = await host.rpc("sontu_host_command", {
      cmd,
      input,
      event_id: eventId,
      expected_version: version,
      operation_id: randomUUID(),
    });
    expect(result.error).toBeNull();
    expect(result.data.status).toBe("ready");
    eventId = result.data.event_id;
    version = result.data.current_version;
  }
  const token = randomBytes(32).toString("hex");
  await command("create_draft", { timezone: "America/Toronto" });
  await command("save_draft", {
    title: `Welcome dinner ${info.project.name}`,
    description: "A private welcome.",
    starts_at: "2030-09-16T23:00:00Z",
    ends_at: "2030-09-17T01:00:00Z",
    timezone: "America/Toronto",
    venue_label: "The garden",
    cover_key: "food",
  });
  await command("publish", { confirmed: true });
  await command("invite_participant", { display_name: "Jay", email, token });
  await page.goto("/#/invite/" + token);
  await page.getByRole("link", { name: "Sign in with your account" }).click();
  await page
    .getByRole("link", { name: "Create an account", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "Continue with Google" }),
  ).toBeDisabled();
  await expect(
    page.getByRole("button", { name: "Continue with Apple" }),
  ).toBeDisabled();
  await expect(page.getByLabel("First name", { exact: true })).toHaveCount(0);
  await expect(page.locator('.password-rules [data-met="false"]')).toHaveCount(
    5,
  );
  await page.getByLabel("Email", { exact: true }).fill(email);
  await page.getByLabel("Password", { exact: true }).fill("weak");
  await expect(
    page.getByRole("button", { name: "Create account", exact: true }),
  ).toBeDisabled();
  await page.getByLabel("Password", { exact: true }).fill(password);
  await expect(page.locator('.password-rules [data-met="true"]')).toHaveCount(
    5,
  );
  await page.getByRole("button", { name: "Show password" }).click();
  await expect(page.getByLabel("Password", { exact: true })).toHaveAttribute(
    "type",
    "text",
  );
  await page.getByRole("button", { name: "Hide password" }).click();
  await page.getByRole("checkbox").check();
  expect(
    (
      await new AxeBuilder({ page })
        .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
        .analyze()
    ).violations,
  ).toEqual([]);
  await page.screenshot({
    path: info.outputPath("signup.png"),
    fullPage: true,
  });
  await page
    .getByRole("button", { name: "Create account", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Check your email" }),
  ).toBeVisible();
  let mailId = "";
  await expect
    .poll(
      async () => {
        const data = await (
          await request.get(
            process.env.SONTU_TEST_MAIL_URL! + "/api/v1/messages",
          )
        ).json();
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
  expect(
    (await client.auth.verifyOtp({ email, token: code, type: "signup" })).error,
  ).toBeNull();
  await page
    .getByRole("link", { name: "Back to sign in", exact: true })
    .click();
  await page.getByLabel("Email", { exact: true }).fill(email);
  await page.getByLabel("Password", { exact: true }).fill(password);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "What should we call you?" }),
  ).toBeVisible();
  await page.reload();
  await expect(page.getByLabel("First name", { exact: true })).toBeVisible();
  await page.getByLabel("First name", { exact: true }).fill("Jay");
  await page.getByRole("button", { name: "Start exploring" }).click();
  await expect(page).toHaveURL(new RegExp("#/invite/" + token + "$"));
  await page
    .getByRole("button", { name: "Accept invitation", exact: true })
    .click();
  await expect(page.getByText("You’re going.", { exact: true })).toBeVisible();
  const guests = await host.rpc("sontu_host_projection", { event_id: eventId });
  expect(
    guests.data.data.participants.find(
      (p: { invitation_email: string }) => p.invitation_email === email,
    ).commitment_state,
  ).toBe("CONFIRMED");
  await page.screenshot({
    path: info.outputPath("new-account-invitation.png"),
    animations: "disabled",
  });
  await page.getByRole("link", { name: "Your Events" }).click();
  await expect(
    page.getByRole("tab", { name: "Upcoming", exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Profile and appearance" }).click();
  const drawer = page.getByRole("dialog", { name: "Profile", exact: true });
  await expect(
    drawer.getByRole("heading", { name: "Jay", exact: true }),
  ).toBeVisible();
  await expect(drawer.getByText(/@jay_[a-z0-9]+/)).toBeVisible();
  await drawer.getByRole("link", { name: "Edit Profile", exact: true }).click();
  await page.getByLabel("Display name (optional)").fill("Captain J");
  await page
    .getByLabel("Handle", { exact: true })
    .fill("captain_" + info.project.name);
  await page.getByRole("button", { name: "Save profile", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Captain J", exact: true }),
  ).toBeVisible();
  await page.reload();
  await expect(
    page.getByRole("heading", { name: "Captain J", exact: true }),
  ).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth + 1,
    ),
  ).toBe(true);
  // The invited participant can also create an event with this same account.
  await page.goto("/#/events?view=Hosting");
  await page.getByRole("button", { name: "Create Event", exact: true }).click();
  await page
    .getByRole("button", { name: "Start a new draft", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "The idea", exact: true }),
  ).toBeVisible();
  await page.goto("/#/sign-out");
  await expect(
    page.getByText(
      "Sign out of Sontu on this device? Your events and participation will remain saved.",
    ),
  ).toBeVisible();
  await page.getByRole("button", { name: "Sign out" }).click();
  await expect(page.getByText("No account is signed in.")).toBeVisible();
  await page.goto("/#/home");
  await page.getByRole("button", { name: "Profile and appearance" }).click();
  await expect(
    page
      .getByRole("dialog")
      .getByRole("link", { name: "Sign in/Create Account", exact: true }),
  ).toBeVisible();
});
