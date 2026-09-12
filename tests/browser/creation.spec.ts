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
  await expect(page.getByLabel("Event timezone")).toHaveValue(
    await page.evaluate(() => Intl.DateTimeFormat().resolvedOptions().timeZone),
  );
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
  await expect(
    page.getByRole("region", { name: "Event status", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("region", { name: "Next up", exact: true }),
  ).toBeVisible();
  await page.screenshot({
    path: info.outputPath("host-overview-light.png"),
    animations: "disabled",
    fullPage: false,
  });
  await page.evaluate(() => (document.documentElement.dataset.theme = "dark"));
  await page.screenshot({
    path: info.outputPath("host-overview-dark.png"),
    animations: "disabled",
    fullPage: false,
  });
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
  const guestAction = await page
    .getByRole("button", { name: "Manage guests", exact: true })
    .boundingBox();
  expect(guestAction).not.toBeNull();
  expect(guestAction!.y + guestAction!.height).toBeLessThan(650);
  await page.reload();
  await expect(
    page.getByRole("heading", {
      name: `Garden dinner ${info.project.name}`,
      exact: true,
    }),
  ).toBeVisible();
  await page.goto("/#/events");
  await page.getByRole("tab", { name: "Upcoming", exact: true }).click();
  await expect(
    page
      .getByRole("link")
      .filter({ hasText: `Garden dinner ${info.project.name}` })
      .first(),
  ).toBeVisible();
  await page.getByRole("tab", { name: "Hosting", exact: true }).click();
  await expect(
    page
      .getByRole("link")
      .filter({ hasText: `Garden dinner ${info.project.name}` })
      .first(),
  ).toBeVisible();

  const hostedCard = page
    .getByRole("link")
    .filter({ hasText: `Garden dinner ${info.project.name}` })
    .first();
  await expect(hostedCard.getByText("Hosting", { exact: true })).toBeVisible();
  await expect(
    page.getByRole("region", { name: "Published & upcoming", exact: true }),
  ).toBeVisible();
  await hostedCard.click();
  await expect(
    page.getByRole("heading", { name: "About this event" }),
  ).toBeVisible();
  await expect(page.getByText("An evening with friends.")).toBeVisible();
  await expect(
    page.getByText("America/Vancouver", { exact: true }),
  ).toBeVisible();
  await page.screenshot({
    path: info.outputPath("event-hub.png"),
    animations: "disabled",
  });
  await page.getByRole("link", { name: "Manage event", exact: true }).click();
  await page
    .getByRole("button", { name: "Manage guests", exact: true })
    .click();
  await expect(
    page.getByText("No guests yet.", { exact: false }),
  ).toBeVisible();
  await page.getByLabel("Search guests").fill("nobody");
  await expect(page.getByText("0 guests shown", { exact: true })).toBeVisible();
  await page.getByLabel("Search guests").fill("");
  await page
    .getByLabel("Guest status", { exact: true })
    .selectOption("attending");
  await expect(page.getByText("0 guests shown", { exact: true })).toBeVisible();
  await page.getByLabel("Guest status", { exact: true }).selectOption("all");
  await page.getByLabel("Invitee name").fill("Dinner guest");
  await page
    .getByLabel("Invitee email")
    .fill(`dinner-${info.project.name}@sontu.example`);
  await page.getByRole("button", { name: "Create invitation link" }).click();
  const invitationDialog = page.getByRole("dialog");
  const invitationLink = invitationDialog.getByLabel("Private response link");
  await expect(invitationLink).toHaveValue(/#\/invite\/[a-f0-9]+$/);
  // Exercise a real clipboard failure without falsely reporting a copied link.
  await page.evaluate(() =>
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: {
        writeText: async () => {
          throw new Error("Denied");
        },
      },
    }),
  );
  await invitationDialog
    .getByRole("button", { name: "Copy invitation link" })
    .click();
  await expect(invitationDialog.getByRole("status")).toContainText(
    "Could not copy automatically",
  );
  await page.evaluate(() =>
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: { writeText: async () => {} },
    }),
  );
  await invitationDialog
    .getByRole("button", { name: "Copy invitation link" })
    .click();
  await expect(invitationDialog.getByRole("status")).toContainText(
    "Link copied",
  );
  await page.screenshot({
    path: info.outputPath("invitation-link.png"),
    animations: "disabled",
  });
  await invitationDialog
    .getByRole("button", { name: "Done", exact: true })
    .click();
  await expect(page.getByText("Dinner guest", { exact: true })).toBeVisible();
  const modules = page
    .getByRole("navigation", { name: "Event workspace modules" })
    .filter({ visible: true });
  await modules.getByRole("button", { name: "Overview", exact: true }).click();
  await page
    .getByRole("button", { name: "Edit description", exact: true })
    .click();
  await page
    .getByRole("dialog")
    .getByLabel("Description", { exact: true })
    .fill("Bring a favourite dish.");
  await page
    .getByRole("button", { name: "Save description", exact: true })
    .click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await page.getByRole("link", { name: "View event", exact: true }).click();
  await expect(page.getByText("Bring a favourite dish.")).toBeVisible();
  await page.getByRole("link", { name: "Manage event", exact: true }).click();
  await page.getByRole("button", { name: "Cancel event", exact: true }).click();
  await expect(
    page
      .getByRole("dialog")
      .getByText("No cancellation email will be sent automatically.", {
        exact: false,
      }),
  ).toBeVisible();
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Cancel event", exact: true })
    .click();
  await expect(
    page.getByText("This event is cancelled.", { exact: true }),
  ).toBeVisible();
  await page.getByRole("link", { name: "View event", exact: true }).click();
  await expect(
    page.getByText(
      "This event is cancelled. New participation is unavailable.",
    ),
  ).toBeVisible();
  await page.goto("/#/events?view=Upcoming");
  await expect(
    page.getByRole("heading", { name: "Your upcoming events", exact: true }),
  ).toBeVisible();
  await expect(
    page
      .getByRole("link")
      .filter({ hasText: `Garden dinner ${info.project.name}` }),
  ).toHaveCount(0);
  await page.getByRole("tab", { name: "Hosting", exact: true }).click();
  await expect(
    page
      .getByRole("region", { name: "History & cancelled", exact: true })
      .getByRole("link")
      .filter({ hasText: `Garden dinner ${info.project.name}` }),
  ).toBeVisible();
});
