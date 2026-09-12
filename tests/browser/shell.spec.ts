import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
const routes = [
  "home",
  "discover",
  "events",
  "feed",
  "events/sunset-social",
  "events/sunset-social/host",
  "host/events/sunset-social",
];
for (const route of routes) {
  test(`${route}: layout, semantics and assets`, async ({ page }, info) => {
    await page.goto("/#/" + route);
    await expect(page.locator("main")).toBeVisible();
    await page.locator("img").evaluateAll(async (images) => {
      await Promise.all(
        images.map((i) =>
          (() => {
            (i as HTMLImageElement).loading = "eager";
            return (i as HTMLImageElement).decode().catch(() => {});
          })(),
        ),
      );
    });
    const host = route.includes("/host") || route.startsWith("host/");
    if (host)
      await expect(
        page.getByRole("navigation", { name: "Main navigation" }),
      ).toHaveCount(0);
    else
      await expect(
        page
          .getByRole("navigation", { name: "Main navigation" })
          .getByRole("link"),
      ).toHaveCount(4);
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth + 1,
      ),
    ).toBe(true);
    expect(
      await page
        .locator("img:visible")
        .evaluateAll((imgs) =>
          imgs.every((i) => (i as HTMLImageElement).naturalWidth > 0),
        ),
    ).toBe(true);
    const results = await new AxeBuilder({ page })
      .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
      .analyze();
    expect(results.violations).toEqual([]);
    await page.screenshot({
      path: info.outputPath(route.replaceAll("/", "-") + ".png"),
      fullPage: true,
    });
  });
}
test("theme, square imagery, keyboard, and focused host transition", async ({
  page,
}, info) => {
  await page.goto("/#/profile");
  await page.getByLabel("Display mode").selectOption("dark");
  await page.getByLabel("Curated accent").selectOption("navy");
  await page.goto("/#/events?view=Hosting");
  const image = page.locator(".compact-square .event-image").first();
  const box = await image.boundingBox();
  expect(box?.width).toBe(box?.height);
  await page.getByRole("link", { name: "Manage event" }).click();
  await expect(
    page.getByRole("navigation", { name: "Main navigation" }),
  ).toHaveCount(0);
  const nav = page.locator(".workspace-nav:visible");
  await nav.getByRole("button", { name: "Team & Roles" }).click();
  await expect(
    page.getByRole("heading", { name: "Team & Roles" }),
  ).toBeVisible();
  expect(
    (
      await new AxeBuilder({ page })
        .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
        .analyze()
    ).violations,
  ).toEqual([]);
  await page.screenshot({
    path: info.outputPath("dark-host-team.png"),
    fullPage: true,
  });
  await page.getByRole("link", { name: "Close workspace" }).click();
  await expect(
    page.getByRole("navigation", { name: "Main navigation" }),
  ).toBeVisible();
  await page.keyboard.press("Tab");
  expect(
    await page.evaluate(() => {
      const el = document.activeElement;
      return !!el && getComputedStyle(el).outlineStyle !== "none";
    }),
  ).toBe(true);
});
test("320px text reflow and unresolved state", async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 900 });
  await page.goto("/#/preview/states");
  await page.getByLabel("Preview state").selectOption("pending_unknown");
  await page.addStyleTag({ content: "html{font-size:200%}" });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth + 1,
    ),
  ).toBe(true);
  await expect(
    page.getByText("The outcome is unresolved. Don’t treat this as confirmed."),
  ).toBeVisible();
});
