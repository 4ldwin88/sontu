import { test, expect } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";
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
  await page.goto("/#/sign-up");
  await expect(
    page.getByRole("button", { name: "Continue with Google" }),
  ).toBeDisabled();
  await expect(
    page.getByRole("button", { name: "Continue with Apple" }),
  ).toBeDisabled();
  await expect(page.getByLabel("First name", { exact: true })).toHaveCount(0);
  await expect(page.locator('.password-rules [data-met="false"]')).toHaveCount(5);
  await page.getByLabel("Email", { exact: true }).fill(email);
  await page.getByLabel("Password", { exact: true }).fill("weak");
  await expect(
    page.getByRole("button", { name: "Create account", exact: true }),
  ).toBeDisabled();
  await page.getByLabel("Password", { exact: true }).fill(password);
  await expect(page.locator('.password-rules [data-met="true"]')).toHaveCount(5);
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
  await page.goto("/#/sign-in");
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
  await page.goto("/#/sign-out");
  await page.getByRole("button", { name: "Sign out of host account" }).click();
  await expect(page.getByText("No account is signed in.")).toBeVisible();
  await page.goto("/#/home");
  await page.getByRole("button", { name: "Profile and appearance" }).click();
  await expect(
    page
      .getByRole("dialog")
      .getByRole("link", { name: "Sign in/Create Account", exact: true }),
  ).toBeVisible();
});
