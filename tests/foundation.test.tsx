import { describe, it, expect } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import App from "../apps/web/src/App";
import { eventById, events } from "../packages/test-fixtures/events";
import {
  eventsForView,
  hostProjection,
} from "../packages/application/projections";
function open(path = "/home") {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <App />
    </MemoryRouter>,
  );
}
describe("governed presentation boundaries", () => {
  it("exposes exactly four global roots", () => {
    open();
    expect(
      within(screen.getByRole("navigation", { name: "Main navigation" }))
        .getAllByRole("link")
        .map((x) => x.textContent),
    ).toEqual(["Home", "Discover", "Events", "Feed"]);
  });
  it("retains relationship tabs and reveals contextual creation only in Hosting", async () => {
    open("/events");
    expect(
      screen.queryByRole("button", { name: "Create Event" }),
    ).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole("tab", { name: "Hosting" }));
    expect(screen.getByRole("button", { name: "Create Event" })).toBeVisible();
    expect(screen.getByRole("link", { name: /Manage event/ })).toHaveAttribute(
      "href",
      "/events/sunset-social/host",
    );
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
  it("does not expose global navigation inside a hosted workspace", () => {
    open("/events/sunset-social/host");
    expect(
      screen.queryByRole("navigation", { name: "Main navigation" }),
    ).not.toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: "Close workspace" }),
    ).toHaveAttribute("href", "/events?view=Hosting");
    expect(
      screen.getByRole("heading", { name: "Sunset Social at Diamond Bay" }),
    ).toBeVisible();
  });
  it("uses the same event identity in the wide route", () => {
    open("/host/events/sunset-social");
    expect(
      screen.getByRole("heading", { name: "Sunset Social at Diamond Bay" }),
    ).toBeVisible();
    expect(
      screen.getByRole("link", { name: /View event page/ }),
    ).toHaveAttribute("href", "/events/sunset-social");
  });
  it("denies non-host access before showing operational data", () => {
    open("/events/sailing/host");
    expect(
      screen.getByRole("heading", {
        name: "This workspace isn’t available to you",
      }),
    ).toBeVisible();
    expect(screen.queryByText("Portable speaker")).not.toBeInTheDocument();
  });
  it("returns unavailable for unknown identities", () => {
    expect(hostProjection(undefined).status).toBe("unavailable");
    open("/events/missing");
    expect(
      screen.getByRole("heading", { name: "This event isn’t available" }),
    ).toBeVisible();
  });
  it("never renders unknown as success", async () => {
    open("/preview/states");
    await userEvent.selectOptions(
      screen.getByLabelText("Preview state"),
      "pending_unknown",
    );
    expect(
      screen.getByText(
        "The outcome is unresolved. Don’t treat this as confirmed.",
      ),
    ).toBeVisible();
    expect(screen.queryByText("Sample data loaded")).not.toBeInTheDocument();
  });
  it("retries a presentation error without implying a consequential mutation", async () => {
    open("/preview/states");
    await userEvent.selectOptions(
      screen.getByLabelText("Preview state"),
      "error",
    );
    await userEvent.click(screen.getByRole("button", { name: "Try again" }));
    expect(screen.getByText("Sample data loaded")).toBeVisible();
  });
  it("filters actual fixture projections and provides an empty recovery path", async () => {
    open("/discover");
    await userEvent.type(screen.getByRole("searchbox"), "unfindable");
    expect(screen.getByText("Nothing here yet")).toBeVisible();
    await userEvent.click(
      screen.getByRole("button", { name: "Clear filters" }),
    );
    expect(
      screen.getByRole("heading", { name: "Coastal sessions: live music" }),
    ).toBeVisible();
  });
  it("keeps feed items bound to event destinations", () => {
    open("/feed");
    const links = screen.getAllByRole("link", { name: /View event/ });
    expect(links).toHaveLength(3);
    for (const a of links)
      expect(a.getAttribute("href")).toMatch(/^\/events\//);
  });
  it("keeps cosmetic choice separate from event truth", async () => {
    open("/profile");
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
  it("does not create a real event from the contextual preview", async () => {
    open("/events?view=Hosting");
    await userEvent.click(screen.getByRole("button", { name: "Create Event" }));
    await userEvent.click(
      screen.getByRole("button", { name: "Preview next step" }),
    );
    expect(screen.getByLabelText("Event name")).toHaveAttribute(
      "aria-invalid",
      "true",
    );
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
