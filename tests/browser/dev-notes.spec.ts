import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
test("beta notes remain reachable in drawers and save once after an interrupted response", async ({
  page,
}, info) => {
  test.skip(!process.env.SONTU_TEST_PASSWORD, "Requires isolated auth");
  await page.goto("/#/sign-in");
  await page
    .getByLabel("Email", { exact: true })
    .fill(process.env.SONTU_TEST_EMAIL!);
  await page
    .getByLabel("Password", { exact: true })
    .fill(process.env.SONTU_TEST_PASSWORD!);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(page).not.toHaveURL(/#\/sign-in$/);
  await page.goto("/#/home");
  await page.getByRole("button", { name: "Profile and appearance" }).click();
  await page.getByRole("button", { name: "Add dev note", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "Dev notes", exact: true });
  await dialog
    .getByLabel("What should we fix or improve?")
    .fill(`Beta note ${info.project.name}`);
  let dropped = false;
  await page.route("**/rest/v1/sontu_dev_notes*", async (route) => {
    if (!dropped && route.request().method() === "POST") {
      dropped = true;
      await route.fetch();
      await route.abort("failed");
    } else await route.continue();
  });
  await dialog.getByRole("button", { name: "Save note", exact: true }).click();
  await expect(
    dialog.getByText("Saving is unconfirmed. Retry the same note safely."),
  ).toBeVisible();
  await dialog.getByRole("button", { name: "Retry same note" }).click();
  await expect(
    dialog.getByText("Note saved for development review."),
  ).toBeVisible();
  await expect(
    dialog.getByText(`Beta note ${info.project.name}`, { exact: true }),
  ).toHaveCount(1);
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
  await page.screenshot({
    path: info.outputPath("dev-notes.png"),
    animations: "disabled",
  });
  await dialog.getByRole("button", { name: "Close dialog" }).click();
  await page.reload();
  await page.getByRole("button", { name: "Add dev note", exact: true }).click();
  await expect(
    dialog.getByText(`Beta note ${info.project.name}`, { exact: true }),
  ).toHaveCount(1);
});
