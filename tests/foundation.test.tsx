import { describe, it, expect } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { AccountProvider } from "../apps/web/src/account-state";
import App from "../apps/web/src/App";
import { eventCardHref } from "../apps/web/src/invitations";
import { SystemState } from "../packages/ui-web";
import { eventById, events } from "../packages/test-fixtures/events";
import {
  eventsForView,
  hostProjection,
} from "../packages/application/projections";
function open(path = "/home") {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <AccountProvider>
        <App />
      </AccountProvider>
    </MemoryRouter>,
  );
}
describe("governed presentation boundaries", () => {
  it("opens hosted events through the authenticated event hub", () => {
    const hosted = {
      id: "organization-event",
      lifecycle: "PUBLISHED",
      hosting: true,
      owner_kind: "ORGANIZATION",
      owner_name: "RAJA",
    } as Parameters<typeof eventCardHref>[0];
    expect(eventCardHref(hosted)).toBe("/my-events/organization-event");
    expect(eventCardHref({ ...hosted, lifecycle: "DRAFT" }, "Dinner"))
      .toBe("/create/organization-event?format=in-person&category=Dinner");
    expect(eventCardHref({ ...hosted, hosting: false })).toBe(
      "/event/organization-event",
    );
  });
  it("exposes exactly four global roots", () => {
    open();
    expect(
      within(screen.getByRole("navigation", { name: "Main navigation" }))
        .getAllByRole("link")
        .map((x) => x.textContent),
    ).toEqual(["Home", "Discover", "Events", "Feed"]);
  });
  it("retains relationship tabs and keeps creation available across event views", async () => {
    open("/events");
    expect(screen.getByRole("button", { name: "Create Event" })).toBeVisible();
    await userEvent.click(screen.getByRole("tab", { name: "Hosting" }));
    expect(screen.getByRole("button", { name: "Create Event" })).toBeVisible();
    expect(
      screen.getByText("Sign in to see events connected to your account."),
    ).toBeVisible();
  });
  it("supports keyboard navigation among Events tabs", async () => {
    open("/events");
    screen.getByRole("tab", { name: "Upcoming" }).focus();
    await userEvent.keyboard("{ArrowRight}");
    expect(screen.getByRole("tab", { name: "Invited" })).toHaveAttribute(
      "aria-selected",
      "true",
    );
    expect(screen.getByRole("tab", { name: "Invited" })).toHaveFocus();
  });
  it("never renders an unresolved outcome as success", () => {
    render(<SystemState state={{ status: "pending_unknown" }} />);
    expect(
      screen.getByText(
        "The outcome is unresolved. Don’t treat this as confirmed.",
      ),
    ).toBeVisible();
    expect(screen.queryByText("Sample data loaded")).not.toBeInTheDocument();
  });
  it("offers a retry for presentation errors without implying mutation", async () => {
    let retried = false;
    render(
      <SystemState state={{ status: "error" }} onRetry={() => (retried = true)} />,
    );
    await userEvent.click(screen.getByRole("button", { name: "Try again" }));
    expect(retried).toBe(true);
  });
  it("does not mix placeholder events into discovery", async () => {
    open("/discover");
    await userEvent.type(screen.getByRole("searchbox"), "unfindable");
    expect(await screen.findByText("Nothing here yet")).toBeVisible();
    expect(
      screen.getByText("No real discoverable events are available yet."),
    ).toBeVisible();
    await userEvent.click(screen.getByRole("button", { name: "Clear search" }));
    expect(screen.getByRole("searchbox")).toHaveValue("");
  });
  it("does not render placeholder feed items", () => {
    open("/feed");
    expect(
      screen.getByText(
        "Real event updates will appear here when hosts publish them.",
      ),
    ).toBeVisible();
    expect(
      screen.queryByRole("link", { name: /View event/ }),
    ).not.toBeInTheDocument();
  });
  it("keeps cosmetic choice separate from event truth", async () => {
    open("/settings");
    const before = JSON.stringify(events);
    await userEvent.selectOptions(
      screen.getByLabelText("Display mode"),
      "dark",
    );
    await userEvent.selectOptions(
      screen.getByLabelText("Curated accent"),
      "navy",
    );
    expect(document.documentElement.dataset.theme).toBe("dark");
    expect(document.documentElement.dataset.accent).toBe("navy");
    expect(JSON.stringify(events)).toBe(before);
  });
  it("requires host authentication before creating a persistent event", async () => {
    open("/events?view=Hosting");
    await userEvent.click(screen.getByRole("button", { name: "Create Event" }));
    expect(
      await screen.findByRole("dialog", {
        name: "Sign in to create your event",
      }),
    ).toBeVisible();
    expect(
      screen.getByRole("button", { name: "Continue with Google" }),
    ).toBeDisabled();
    expect(
      screen.getByRole("button", { name: "Continue with Apple" }),
    ).toBeDisabled();
    expect(
      screen.getByRole("button", { name: "Continue with email" }),
    ).toBeVisible();
    expect(await screen.findByRole("link", { name: "Sign in" })).toBeVisible();
    expect(events).toHaveLength(6);
  });
  it("separates participation from host access", () => {
    expect(
      eventsForView(events, "Upcoming").map((e) => e.context.relationship),
    ).toEqual(["going", "going"]);
    expect(hostProjection(eventById("sailing")).status).toBe("denied");
    expect(eventById("sunset-social")?.participation).toBeUndefined();
  });
});
