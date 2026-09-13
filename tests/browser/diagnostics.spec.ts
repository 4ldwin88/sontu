import { test, expect } from "@playwright/test";
test("error diagnostics omit error text and can be cleared", async ({
  page,
}) => {
  await page.goto("/#/home");
  await page.evaluate(() =>
    window.dispatchEvent(
      new ErrorEvent("error", {
        message: "private-invitation-token-do-not-record",
      }),
    ),
  );
  await page.goto("/#/help");
  await page.getByText("View diagnostic report", { exact: true }).click();
  const report = page.locator(".diagnostic-report");
  await expect(report).toContainText("unexpected_error");
  await expect(report).not.toContainText("private-invitation-token");
  await page.getByRole("button", { name: "Clear diagnostics" }).click();
  await expect(report).toHaveText("[]");
});
