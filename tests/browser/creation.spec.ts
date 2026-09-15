import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
test("host resumes a draft and publishes only reviewed valid event details", async ({
  page,
}, info) => {
  test.skip(!process.env.SONTU_TEST_PASSWORD, "Requires isolated auth");
  test.setTimeout(120000);
  await page.goto("/#/events?view=Hosting");
  await page.getByRole("button", { name: "Create Event", exact: true }).click();
  await expect(
    page.getByRole("dialog", { name: "Sign in to create your event" }),
  ).toBeVisible();
  await page
    .getByRole("dialog", { name: "Sign in to create your event" })
    .getByRole("link", { name: "Sign in", exact: true })
    .click();
  await page
    .getByLabel("Email", { exact: true })
    .fill(process.env.SONTU_TEST_EMAIL!);
  await page
    .getByLabel("Password", { exact: true })
    .fill(process.env.SONTU_TEST_PASSWORD!);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "What are you creating?" }),
  ).toBeVisible();
  await expect(page.getByRole("combobox", { name: "Event owner" })).toHaveValue("PERSONAL");
  await page.getByRole("button", { name: "Birthday", exact: true }).click();
  await page.getByRole("radio", { name: /In person/ }).check();
  await page.getByRole("button", { name: "Continue to event details" }).click();
  await expect(
    page.getByRole("heading", { name: "The idea", exact: true }),
  ).toBeVisible();
  const draftUrl = page.url();
  await page
    .getByLabel("Event title", { exact: true })
    .fill(`Garden dinner ${info.project.name}`);
  await page.getByLabel("Description").fill("An evening with friends.");
  await page.getByRole("button", { name: "Choose your picture" }).click();
  await page
    .getByRole("dialog", { name: "Choose your picture" })
    .getByRole("radio", { name: "Sunset", exact: true })
    .check();
  // Save reached the server but response was lost: recovery must retain one operation.
  let dropped = false;
  await page.route("**/rest/v1/rpc/sontu_host_command", async (route) => {
    if (!dropped && route.request().postDataJSON()?.cmd === "save_draft") {
      dropped = true;
      await route.fetch();
      await route.abort("failed");
    } else await route.continue();
  });
  await page.getByRole("button", { name: "Save draft" }).click();
  await expect(
    page.getByRole("button", { name: "Retry same save" }),
  ).toBeVisible();
  await page.reload();
  await page.getByRole("button", { name: "Retry same save" }).click();
  await expect(page).toHaveURL(/view=Hosting/);
  await page.goto(draftUrl);
  await expect(
    page.getByRole("heading", { name: "When & where", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByText("device’s detected local timezone"),
  ).toBeVisible();
  await page.getByLabel("Start date and time").fill("2030-09-16T18:00");
  await page.getByLabel("End date and time").fill("2030-09-16T21:00");
  await page.getByLabel("Location", { exact: true }).fill("The garden");
  await page.getByLabel("Participation limit").fill("8");
  await page.getByRole("button", { name: "Preview" }).click();
  await expect(
    page.getByRole("dialog", { name: "Event preview" }),
  ).toBeVisible();
  await expect(
    page.getByText("2030-09-16 · 18:00", { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByText("Ends 2030-09-16 · 21:00", { exact: true }),
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
  await page.getByRole("button", { name: "Close dialog" }).click();
  await page.getByRole("button", { name: "Save draft" }).click();
  await expect(page).toHaveURL(/view=Hosting/);
  await page.goto(draftUrl);
  await expect(page.getByLabel("Event title")).toHaveValue(
    `Garden dinner ${info.project.name}`,
  );
  await page
    .getByRole("button", { name: "Publish event", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "Edit schedule & location" }),
  ).toBeVisible();
  await expect(
    page
      .getByRole("region", { name: "Event status", exact: true })
      .getByText("Published", { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByText("America/Vancouver · Participation limit 8"),
  ).toBeVisible();
  await expect(
    page.getByRole("region", { name: "Event status", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("region", { name: "Next up", exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Change picture" }).click();
  await page
    .getByRole("dialog", { name: "Choose your picture" })
    .getByRole("button", { name: "Market", exact: true })
    .click();
  await expect(page.getByText("Saved. Event status updated.")).toBeVisible();
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
    page.getByRole("region", { name: "Upcoming", exact: true }),
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
    .getByRole("button", { name: "Edit schedule & location", exact: true })
    .click();
  const editor = page.getByRole("dialog");
  await editor.getByLabel("Start date and time").fill("2030-09-17T18:30");
  await editor.getByLabel("End date and time").fill("2030-09-17T22:00");
  await editor
    .getByLabel("Location", { exact: true })
    .fill("The covered terrace");
  await editor.getByRole("button", { name: "Review changes" }).click();
  await expect(
    editor.getByRole("heading", { name: "Review event changes" }),
  ).toBeVisible();
  await expect(
    editor.getByText("Previously: The garden", { exact: true }),
  ).toBeVisible();
  await expect(
    editor.getByText("Now: The covered terrace", { exact: true }),
  ).toBeVisible();
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
  await page.screenshot({
    path: info.outputPath("schedule-review.png"),
    animations: "disabled",
  });
  await editor.getByRole("button", { name: "Save event changes" }).click();
  await expect(editor).toHaveCount(0);
  await page.getByRole("link", { name: "View event", exact: true }).click();
  await expect(
    page.getByText("The covered terrace", { exact: true }),
  ).toBeVisible();
  await expect(page.getByText(/Ends.*10:00/)).toBeVisible();
  await page.getByRole("link", { name: "Manage event", exact: true }).click();
  await page
    .getByRole("button", { name: "Manage guests", exact: true })
    .click();
  await expect(
    page.getByText("No guests yet.", { exact: false }),
  ).toBeVisible();
  await page.getByLabel("Search guests").fill("nobody");
  await expect(page.getByText("0 people shown", { exact: true })).toBeVisible();
  await page.getByLabel("Search guests").fill("");
  await page
    .getByLabel("Guest status", { exact: true })
    .selectOption("attending");
  await expect(page.getByText("1 person shown", { exact: true })).toBeVisible();
  await expect(
    page
      .getByRole("listitem", { name: "Event host" })
      .getByText("Host", { exact: true }),
  ).toBeVisible();
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
  await modules.getByRole("button", { name: "To Do", exact: true }).click();
  await expect(
    page.getByText("Nothing here yet.", { exact: true }),
  ).toBeVisible();
  await page.getByLabel("Task", { exact: true }).fill("Confirm table setup");
  await page.getByRole("button", { name: "Add task", exact: true }).click();
  await expect(
    page.getByText("Confirm table setup", { exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Complete", exact: true }).click();
  await expect(page.getByText("Completed", { exact: true })).toBeVisible();
  await modules.getByRole("button", { name: "Resources", exact: true }).click();
  await page.getByLabel("Resource", { exact: true }).fill("Folding tables");
  await page.getByLabel("Quantity", { exact: true }).fill("2");
  await page.getByLabel("Note", { exact: true }).fill("Check the garage");
  await page.getByRole("button", { name: "Add resource", exact: true }).click();
  await expect(
    page.getByText("Folding tables · 2", { exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Mark ready", exact: true }).click();
  await expect(page.getByText(/Ready · Check the garage/)).toBeVisible();
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
  await page.reload();
  await modules.getByRole("button", { name: "Resources", exact: true }).click();
  await expect(
    page.getByText("Folding tables · 2", { exact: true }),
  ).toBeVisible();
  await modules.getByRole("button", { name: "Overview", exact: true }).click();
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
      .getByRole("region", { name: "History", exact: true })
      .getByRole("link")
      .filter({ hasText: `Garden dinner ${info.project.name}` }),
  ).toBeVisible();
});
