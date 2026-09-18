import { test, expect } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";
import { randomUUID, randomBytes } from "node:crypto";
import AxeBuilder from "@axe-core/playwright";

const avatarPng = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Wl2nWQAAAAASUVORK5CYII=",
  "base64",
);

test("account portal registers, resumes minimum profile, and keeps real identity after sign-in", async ({
  page,
  request,
}, info) => {
  test.skip(!process.env.SONTU_TEST_API, "Requires isolated Auth");
  test.setTimeout(120000);
  const api = process.env.SONTU_TEST_API!;
  if (!/^http:\/\/(127\.0\.0\.1|localhost):/.test(api))
    throw Error("No hosted signup test");
  const email = `account-${info.project.name}-${randomUUID().slice(0, 8)}@sontu.example`,
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
  const hostSession = await host.auth.signInWithPassword({
    email: process.env.SONTU_TEST_EMAIL!,
    password: process.env.SONTU_TEST_PASSWORD!,
  });
  expect(hostSession.error).toBeNull();
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
  const confirmationHeading = page.getByRole("heading", {
    name: "Check your email",
  });
  const setupHeading = page.getByRole("heading", {
    name: "What should we call you?",
  });
  await expect(confirmationHeading.or(setupHeading)).toBeVisible();
  if (await confirmationHeading.isVisible()) {
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
            data.messages?.find(
              (m: { ID: string; To: { Address: string }[] }) =>
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
    const confirmationHref = mail.HTML?.match(
      /href="([^"]+\/auth\/v1\/verify\?[^"]+)"/i,
    )?.[1].replaceAll("&amp;", "&");
    if (!confirmationHref)
      throw new Error("Confirmation link missing from local email");
    const confirmationUrl = new URL(confirmationHref);
    const localApi = new URL(process.env.SONTU_TEST_API!);
    confirmationUrl.protocol = localApi.protocol;
    confirmationUrl.host = localApi.host;
    const confirmation = await request.get(confirmationUrl.toString(), {
      maxRedirects: 0,
    });
    expect([302, 303]).toContain(confirmation.status());
    await page
      .getByRole("link", { name: "Back to sign in", exact: true })
      .click();
    await page.getByLabel("Email", { exact: true }).fill(email);
    await page.getByLabel("Password", { exact: true }).fill(password);
    await page.getByRole("button", { name: "Sign in", exact: true }).click();
  }
  const acceptInvitation = page.getByRole("button", {
    name: "Accept invitation",
    exact: true,
  });
  await expect(setupHeading.or(acceptInvitation)).toBeVisible();
  let acceptedBeforeSetup = false;
  if (!(await setupHeading.isVisible())) {
    await acceptInvitation.click();
    acceptedBeforeSetup = true;
    await page.getByRole("link", { name: "Your Events" }).click();
  }
  await expect(setupHeading).toBeVisible();
  await page.reload();
  await expect(page.getByLabel("Name", { exact: true })).toBeVisible();
  await page.getByLabel("Name", { exact: true }).fill("Jay");
  await page.getByRole("button", { name: "Start exploring" }).click();
  if (!acceptedBeforeSetup) {
    await expect(page).toHaveURL(new RegExp("#/invite/" + token + "$"));
    await page
      .getByRole("button", { name: "Accept invitation", exact: true })
      .click();
  } else {
    await page.goto("/#/invite/" + token);
  }
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
  await page.getByLabel("Profile image").setInputFiles({
    name: "avatar.png",
    mimeType: "image/png",
    buffer: avatarPng,
  });
  await expect(page.locator(".profile-image-preview img")).toBeVisible();
  await page.getByLabel("Display name (optional)").fill("Captain J");
  await page
    .getByLabel("Handle", { exact: true })
    .fill(`captain_${info.project.name}_${randomUUID().slice(0, 6)}`);
  await page.getByLabel("Contact email", { exact: true }).fill(email);
  await page.getByLabel("Phone", { exact: true }).fill("+1 416 555 0101");
  await page.getByLabel("Location", { exact: true }).fill("Toronto, Ontario");
  await page.getByRole("button", { name: "Save profile", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Profile and appearance" }),
  ).toBeVisible();
  await page.reload();
  await page.getByRole("button", { name: "Profile and appearance" }).click();
  await expect(
    page.getByRole("dialog", { name: "Profile", exact: true }).locator("img"),
  ).toBeVisible();
  await expect(
    page
      .getByRole("dialog", { name: "Profile", exact: true })
      .getByRole("heading", { name: "Captain J", exact: true }),
  ).toBeVisible();
  await page
    .getByRole("dialog", { name: "Profile", exact: true })
    .getByRole("link", { name: "View Profile", exact: true })
    .click();
  await expect(page.getByText(email, { exact: true })).toBeVisible();
  await expect(
    page.getByText("+1 416 555 0101", { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByText("Toronto, Ontario", { exact: true }),
  ).toBeVisible();
  const accountSession = await client.auth.signInWithPassword({
    email,
    password,
  });
  expect(accountSession.error).toBeNull();
  const userId = accountSession.data.user!.id;
  const ownObjects = await client.storage.from("profile-media").list(userId);
  expect(ownObjects.error).toBeNull();
  expect(ownObjects.data).toHaveLength(1);
  const deniedUpload = await client.storage
    .from("profile-media")
    .upload(`${hostSession.data.user!.id}/not-yours.png`, avatarPng, {
      contentType: "image/png",
    });
  expect(deniedUpload.error).not.toBeNull();

  await page.goto("/#/profile");
  await page.getByRole("button", { name: "Edit Profile" }).click();
  await page.getByLabel("Profile image").setInputFiles({
    name: "replacement.png",
    mimeType: "image/png",
    buffer: avatarPng,
  });
  await page.getByRole("button", { name: "Save profile", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Profile and appearance" }),
  ).toBeVisible();
  const replacedObjects = await client.storage
    .from("profile-media")
    .list(userId);
  expect(replacedObjects.error).toBeNull();
  expect(replacedObjects.data).toHaveLength(1);
  expect(replacedObjects.data?.[0]?.name).not.toBe(ownObjects.data?.[0]?.name);

  await page.getByRole("button", { name: "Close profile" }).click();
  await page.goto("/#/profile");
  await page.getByRole("button", { name: "Edit Profile" }).click();
  await page.getByLabel("Profile image").setInputFiles({
    name: "avatar.svg",
    mimeType: "image/svg+xml",
    buffer: Buffer.from("<svg xmlns='http://www.w3.org/2000/svg'/>"),
  });
  await expect(
    page.getByText("Use a JPG, PNG, GIF, or WebP image under 2 MB."),
  ).toBeVisible();
  await page.getByRole("button", { name: "Remove profile image" }).click();
  await page.getByRole("button", { name: "Save profile", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Profile and appearance" }),
  ).toBeVisible();
  const removedObjects = await client.storage
    .from("profile-media")
    .list(userId);
  expect(removedObjects.error).toBeNull();
  expect(removedObjects.data).toHaveLength(0);
  await page.getByRole("button", { name: "Close profile" }).click();
  await page.goto("/#/profile");
  await page
    .getByRole("link", { name: "View public profile", exact: true })
    .click();
  await expect(
    page.getByRole("link", { name: email, exact: true }),
  ).toHaveAttribute("href", `mailto:${email}`);
  await expect(
    page.getByRole("link", { name: "+1 416 555 0101", exact: true }),
  ).toHaveAttribute("href", "tel:+1 416 555 0101");
  await expect(
    page.getByText("Toronto, Ontario", { exact: true }),
  ).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth + 1,
    ),
  ).toBe(true);
  // The invited participant can also create an event with this same account.
  await page.goto("/#/events?view=Hosting");
  await page.getByRole("button", { name: "Create Event", exact: true }).click();
  await page.getByRole("button", { name: "Birthday", exact: true }).click();
  await page
    .getByRole("button", { name: "Continue to event details", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Event details", exact: true }),
  ).toBeVisible();
  await page.goto("/#/sign-out");
  await expect(
    page.getByText(
      "Sign out of Sontu on this device? Your events and participation will remain saved.",
    ),
  ).toBeVisible();
  await page.getByRole("button", { name: "Sign out" }).click();
  await expect(page).toHaveURL(/#\/home$/);
  await expect(
    page.getByRole("heading", { name: "More together." }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Profile and appearance" }).click();
  await expect(
    page
      .getByRole("dialog")
      .getByRole("link", { name: "Sign in/Create Account", exact: true }),
  ).toBeVisible();
});
