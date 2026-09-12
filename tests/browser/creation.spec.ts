import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
test("host resumes a draft and publishes only reviewed valid event details", async ({
  page,
}, info) => {
  test.skip(!process.env.SONTU_TEST_PASSWORD, "Requires isolated auth");
  test.setTimeout(90000);
  await page.goto("/#/events?view=Hosting");
  await page.getByRole("button", { name: "Create Event", exact: true }).click();
  await page
    .getByLabel("Email", { exact: true })
    .fill(process.env.SONTU_TEST_EMAIL!);
  await page
    .getByLabel("Password", { exact: true })
    .fill(process.env.SONTU_TEST_PASSWORD!);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await page.getByRole("button", { name: "Start a new draft" }).click();
  await expect(
    page.getByRole("heading", { name: "The idea", exact: true }),
  ).toBeVisible();
  const draftUrl = page.url();
  await page
    .getByLabel("Event title", { exact: true })
    .fill(`Garden dinner ${info.project.name}`);
  await page.getByLabel("Description").fill("An evening with friends.");
  await page.getByRole("radio", { name: "Sunset", exact: true }).check();
  // Save reached the server but response was lost: recovery must retain one operation.
  let dropped = false;
  await page.route("**/rest/v1/rpc/sontu_host_command", async (route) => {
    if (!dropped && route.request().postDataJSON()?.cmd === "save_draft") {
      dropped = true;
      await route.fetch();
      await route.abort("failed");
    } else await route.continue();
  });
  await page.getByRole("button", { name: "Save & continue" }).click();
  await expect(
    page.getByRole("button", { name: "Retry same save" }),
  ).toBeVisible();
  await page.reload();
  await page.getByRole("button", { name: "Retry same save" }).click();
  await expect(
    page.getByRole("heading", { name: "When & where", exact: true }),
  ).toBeVisible();
  await page.getByLabel("Event timezone").selectOption("America/Vancouver");
  await page.getByLabel("Start date and time").fill("2030-09-16T18:00");
  await page.getByLabel("End date and time").fill("2030-09-16T21:00");
  await page.getByLabel("Location", { exact: true }).fill("The garden");
  await page.getByLabel("Participation limit").fill("8");
  await page.getByRole("button", { name: "Save & continue" }).click();
  await expect(
    page.getByRole("heading", { name: "Review your event" }),
  ).toBeVisible();
  await expect(
    page.getByText("2030-09-16 · 18:00 — 2030-09-16 · 21:00"),
  ).toBeVisible();
  const a11y = await new AxeBuilder({ page }).analyze();
  expect(a11y.violations).toEqual([]);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBeTruthy();
  await page.screenshot({
    path: info.outputPath("creation-review.png"),
    fullPage: true,
  });
  await page.goto("/#/core");
  await page
    .getByRole("link")
    .filter({ hasText: `Garden dinner ${info.project.name}` })
    .click();
  await expect(page).toHaveURL(draftUrl);
  await expect(page.getByLabel("Event title")).toHaveValue(
    `Garden dinner ${info.project.name}`,
  );
  await page.getByRole("button", { name: "Save & continue" }).click();
  await page.getByRole("button", { name: "Save & continue" }).click();
  await page
    .getByRole("button", { name: "Publish event", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "Change start time" }),
  ).toBeVisible();
  await expect(page.getByText("Published", { exact: true })).toBeVisible();
  await expect(
    page.getByText("America/Vancouver · Participation limit 8"),
  ).toBeVisible();
  await page.reload();
  await expect(
    page.getByRole("heading", {
      name: `Garden dinner ${info.project.name}`,
      exact: true,
    }),
  ).toBeVisible();
});
