import { readFileSync } from "node:fs";
import { describe, it, expect } from "vitest";
import { fireEvent, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { AccountProvider } from "../apps/web/src/account-state";
import App from "../apps/web/src/App";
import { eventCardHref } from "../apps/web/src/invitations";
import { SystemState } from "../packages/ui-web";
import { ScheduleEditor } from "../apps/web/src/schedule-editor";
import { resolveSupabaseUrl } from "../packages/data/sontu";
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
  it("uses the page hostname only for a loopback Supabase URL", () => {
    expect(resolveSupabaseUrl("http://127.0.0.1:55321", "69.194.47.153")).toBe(
      "http://69.194.47.153:55321",
    );
    expect(
      resolveSupabaseUrl("https://project.supabase.co", "69.194.47.153"),
    ).toBe("https://project.supabase.co");
    expect(resolveSupabaseUrl("http://127.0.0.1:55321", "localhost")).toBe(
      "http://127.0.0.1:55321",
    );
  });
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
  it("keeps relationship profile language aligned with Board A", () => {
    const source = readFileSync(`${process.cwd()}/src/profile.tsx`, "utf8");
    expect(source).toContain("Relationships");
    expect(source).toContain("Connections (${accepted.length})");
    expect(source).toContain("Followers (${followers.length})");
    expect(source).toContain("Following (${following.length})");
    expect(source).toContain("Following does not reveal private profile fields.");
    expect(source).toContain("Groups are private and only organize your own connections.");
    expect(source).toContain("[\"events\", \"Events\"]");
    expect(source).not.toContain("[\"activity\", \"Activity\"]");
    expect(source).not.toContain("placeholder=\"RAJA, Family, Close friends\"");
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
  it("keeps sign-out attempts observable", () => {
    const accountSource = readFileSync(`${process.cwd()}/src/account.tsx`, "utf8");
    const coordinationSource = readFileSync(
      `${process.cwd()}/src/coordination.tsx`,
      "utf8",
    );
    expect(accountSource).toContain("sign_out_attempted");
    expect(accountSource).toContain("sign_out_succeeded");
    expect(coordinationSource).toContain("sign_out_attempted");
    expect(coordinationSource).toContain("sign_out_failed");
  });
  it("keeps connected event lifecycle states explicit for participants", () => {
    const source = readFileSync(`${process.cwd()}/src/invitations.tsx`, "utf8");
    expect(source).toContain(
      "Event cancelled. Your admission is no longer valid.",
    );
    expect(source).toContain("Event completed. Responses are closed.");
    expect(source).toContain("Event in progress. New responses are closed.");
    expect(source).toContain("This event is cancelled. New participation is unavailable.");
  });
  it("keeps participant notice copy tied to event truth", () => {
    const source = readFileSync(`${process.cwd()}/src/invitations.tsx`, "utf8");
    expect(source).toContain(
      "Review this event hub for the latest details and confirm whether you can still make it.",
    );
    expect(source).toContain(
      "Email delivery is unavailable. This hub remains the source of truth for changed event details.",
    );
    expect(source).toContain(
      "Keep your private RSVP link for changes or admission details.",
    );
  });
  it("keeps draft creation start and retry observable", () => {
    const source = readFileSync(`${process.cwd()}/src/creation.tsx`, "utf8");
    expect(source).toContain("create_draft_attempted");
    expect(source).toContain("create_draft_delayed");
    expect(source).toContain("create_draft_succeeded");
    expect(source).toContain("create_draft_failed");
    expect(source).toContain("Retry draft creation");
    expect(source).toContain(
      "Draft creation is taking too long. Retry will recover the same draft request.",
    );
    expect(source).toContain("CREATE_TIMEOUT");
  });
  it("keeps primary event list states terminal and retryable", () => {
    const source = readFileSync(`${process.cwd()}/src/App.tsx`, "utf8");
    expect(source).toContain("Featured events could not be loaded.");
    expect(source).toContain("Upcoming events could not be loaded.");
    expect(source).toContain("Discover could not load events.");
    expect(source).toContain("Loading featured events…");
    expect(source).toContain("Loading discoverable events…");
    expect(source).toContain("Loading your event relationships…");
    expect(source).toContain("No featured events are available yet.");
    expect(source).toContain("No upcoming events yet.");
    expect(source).toContain("onRetry={real.reload}");
  });
  it("keeps risky host participant actions observable", () => {
    const coordinationSource = readFileSync(
      `${process.cwd()}/src/coordination.tsx`,
      "utf8",
    );
    for (const eventName of [
      "host_link_issue_attempted",
      "host_link_issue_succeeded",
      "host_link_issue_failed",
      "host_link_revoke_attempted",
      "host_link_revoke_succeeded",
      "host_link_revoke_failed",
      "host_rsvp_remove_attempted",
      "host_rsvp_remove_succeeded",
      "host_rsvp_remove_failed",
    ]) {
      expect(coordinationSource).toContain(eventName);
    }
    expect(coordinationSource).toContain(
      "Private response link revoked. This does not remove the RSVP.",
    );
  });
  it("keeps profile media storage scoped to the owner's folder", () => {
    const original = readFileSync(
      `${process.cwd()}/../../supabase/migrations/20260915130000_profile_avatar_storage.sql`,
      "utf8",
    );
    const repair = readFileSync(
      `${process.cwd()}/../../supabase/migrations/20260917202804_repair_profile_avatar_storage_lifecycle.sql`,
      "utf8",
    );
    const source = original + repair;
    expect(source).toContain("profile-media");
    expect(source).toContain("file_size_limit, allowed_mime_types");
    expect(source).toContain("2097152");
    expect(source).toContain("image/webp");
    expect(source).toContain("Profile media public read");
    expect(source).toContain("Profile media own folder insert");
    expect(source).toContain("Profile media own folder update");
    expect(source).toContain("Profile media own folder delete");
    expect(repair).toContain("owner_id = (select auth.uid()::text)");
    expect(source).toContain("(storage.foldername(name))[1] = (select auth.uid())::text");
    expect(repair).toContain('for select to anon, authenticated');
    expect(repair).toContain('for insert to authenticated');
    expect(repair).toContain('for update to authenticated');
    expect(repair).toContain('for delete to authenticated');
  });
  it("keeps event media storage scoped to the host owner's folder", () => {
    const source = readFileSync(
      `${process.cwd()}/../../supabase/migrations/20260915133000_event_cover_uploads.sql`,
      "utf8",
    );
    expect(source).toContain("event-media");
    expect(source).toContain("file_size_limit, allowed_mime_types");
    expect(source).toContain("5242880");
    expect(source).toContain("image/webp");
    expect(source).toContain("Event media public read");
    expect(source).toContain("Event media own folder insert");
    expect(source).toContain("Event media own folder update");
    expect(source).toContain("Event media own folder delete");
    expect(source).toContain("owner = (select auth.uid())");
    expect(source).toContain("(storage.foldername(name))[1] = (select auth.uid())::text");
  });
  it("keeps organization media storage scoped to the uploading account", () => {
    const source = readFileSync(
      `${process.cwd()}/../../supabase/migrations/20260917005221_organization_logo_storage.sql`,
      "utf8",
    );
    expect(source).toContain("organization-media");
    expect(source).toContain("Organization media public read");
    expect(source).toContain("Organization media own folder insert");
    expect(source).toContain("Organization media own folder update");
    expect(source).toContain("Organization media own folder delete");
    expect(source).toContain("owner = (select auth.uid())");
    expect(source).toContain(
      "(storage.foldername(name))[1] = (select auth.uid())::text",
    );
  });
  it("moves the end with the start while preserving event duration", () => {
    render(
      <ScheduleEditor
        version={{
          id: "version-1",
          version_number: 1,
          title: "Schedule test",
          description: "",
          starts_at: "2030-09-16T22:00:00Z",
          ends_at: "2030-09-17T01:00:00Z",
          timezone: "America/Toronto",
          venue_label: "Here",
          materiality_class: "INITIAL",
        }}
        affected={0}
        busy={false}
        blocked={false}
        feedback={null}
        onSave={() => undefined}
        onClose={() => undefined}
      />,
    );
    fireEvent.change(screen.getByLabelText("Start date and time"), {
      target: { value: "2030-09-17T18:00" },
    });
    expect(screen.getByLabelText("End date and time")).toHaveValue(
      "2030-09-17T21:00",
    );
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
