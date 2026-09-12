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

test("root navigation starts at top and chrome follows scroll direction", async ({
  page,
}) => {
  await page.goto("/#/feed");
  await page.evaluate(() => window.scrollTo(0, 450));
  await expect(page.locator(".app-shell")).toHaveClass(/chrome-hidden/);
  await page.evaluate(() => window.scrollTo(0, 320));
  await expect(page.locator(".app-shell")).not.toHaveClass(/chrome-hidden/);
  await page
    .getByRole("navigation", { name: "Main navigation" })
    .getByRole("link", { name: "Discover" })
    .click();
  await expect.poll(() => page.evaluate(() => window.scrollY)).toBe(0);
  await expect(page.locator(".app-shell")).not.toHaveClass(/chrome-hidden/);
  await expect(page.locator(".top-utilities")).toBeInViewport();
  await page
    .getByRole("navigation", { name: "Main navigation" })
    .getByRole("link", { name: "Home" })
    .click();
  await expect.poll(() => page.evaluate(() => window.scrollY)).toBe(0);
});

test("utility drawers keep the page, trap focus, and return focus", async ({
  page,
}, info) => {
  await page.goto("/#/discover");
  await page.getByRole("button", { name: "Profile and appearance" }).click();
  const profile = page.getByRole("dialog", { name: "Profile", exact: true });
  await expect(profile).toBeVisible();
  await expect(page).toHaveURL(/#\/discover$/);
  await page.getByLabel("Display mode").selectOption("dark");
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  for (let i = 0; i < 9; i++) {
    await page.keyboard.press("Tab");
    expect(
      await profile.evaluate((el) => el.contains(document.activeElement)),
    ).toBe(true);
  }
  expect(
    (
      await new AxeBuilder({ page })
        .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
        .analyze()
    ).violations,
  ).toEqual([]);
  await page.screenshot({ path: info.outputPath("profile-drawer.png") });
  await page.keyboard.press("Escape");
  await expect(profile).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: "Profile and appearance" }),
  ).toBeFocused();
  await page
    .getByRole("button", { name: "Notifications", exact: true })
    .click();
  const notifications = page.getByRole("dialog", {
    name: "Notifications",
    exact: true,
  });
  await expect(notifications).toBeVisible();
  await notifications.evaluate(async (el) => {
    await Promise.all(el.getAnimations().map((a) => a.finished));
  });
  const box = await notifications.boundingBox();
  expect(Math.round((box?.x ?? 0) + (box?.width ?? 0))).toBe(
    page.viewportSize()!.width,
  );
  await page.screenshot({ path: info.outputPath("notifications-drawer.png") });
  await notifications.getByRole("link").first().click();
  await expect(notifications).toHaveCount(0);
  await expect(page).toHaveURL(/#\/events\/sunset-social$/);
  await expect.poll(() => page.evaluate(() => window.scrollY)).toBe(0);
});

test("sideways root gestures respect controls, direction and boundaries", async ({
  page,
}) => {
  const swipe = async (selector: string, dx: number, dy = 0) => {
    await page
      .locator(selector)
      .first()
      .evaluate(
        (el, { dx, dy }) => {
          const touch = (x: number, y: number) =>
            new Touch({ identifier: 1, target: el, clientX: x, clientY: y });
          el.dispatchEvent(
            new TouchEvent("touchstart", {
              bubbles: true,
              touches: [touch(180, 250)],
              changedTouches: [touch(180, 250)],
            }),
          );
          el.dispatchEvent(
            new TouchEvent("touchend", {
              bubbles: true,
              touches: [],
              changedTouches: [touch(180 + dx, 250 + dy)],
            }),
          );
        },
        { dx, dy },
      );
  };
  await page.goto("/#/home");
  await swipe(".home-welcome", 100);
  await expect(page).toHaveURL(/#\/home$/);
  await swipe(".home-welcome", -100, 100);
  await expect(page).toHaveURL(/#\/home$/);
  await swipe(".home-welcome", -100);
  await expect(page).toHaveURL(/#\/discover$/);
  await swipe(".filter-row button", -100);
  await expect(page).toHaveURL(/#\/discover$/);
  await swipe(".discover-feature", -100);
  await expect(page).toHaveURL(/#\/events$/);
  await swipe(".events-page h1", -100);
  await expect(page).toHaveURL(/#\/feed$/);
  await swipe(".feed-item", -100);
  await expect(page).toHaveURL(/#\/feed$/);
  await swipe(".feed-item", 100);
  await expect(page).toHaveURL(/#\/events$/);
});
