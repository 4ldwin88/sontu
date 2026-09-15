// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";

const { rpc } = vi.hoisted(() => ({ rpc: vi.fn() }));

rpc.mockImplementation(async (name: string) => {
  if (name === "sontu_event_hub")
    return {
      status: "ready",
      event: {
        id: "event-1",
        title: "Real event projection",
        starts_at: "2026-09-20T17:00:00Z",
        ends_at: null,
        description: "Loaded from the event hub projection.",
        timezone: "UTC",
        venue_label: "Harbour room",
        cover_key: "none",
        lifecycle: "PUBLISHED",
        hosting: true,
        commitment_state: null,
        invitation_state: null,
        current_version: 1,
      },
      viewer: { hosting: true, display_name: "Host" },
      host: { display_name: "Host" },
      going: [],
    };
  if (name === "sontu_event_team_hub_action")
    return { status: "ready", action: "FULL_HOST", role: "OWNER" };
  return { status: "ready", items: [], enabled: false, notices: [] };
});

vi.mock("../packages/data/sontu", () => ({
  rpc,
  supabase: {
    auth: {
      onAuthStateChange: () => ({ data: { subscription: { unsubscribe() {} } } }),
      signOut: vi.fn(),
    },
  },
}));

vi.mock("../apps/web/src/coordination", () => ({
  SessionGate: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

import { ConnectedEventHub } from "../apps/web/src/invitations";

describe("connected event routes", () => {
  it("renders the real hub projection rather than a fixture event", async () => {
    render(
      <MemoryRouter initialEntries={["/my-events/event-1"]}>
        <Routes>
          <Route path="/my-events/:eventId" element={<ConnectedEventHub />} />
        </Routes>
      </MemoryRouter>,
    );

    expect(
      await screen.findByRole("heading", { name: "Real event projection" }),
    ).toBeVisible();
    expect(screen.getByRole("link", { name: "Manage event" })).toHaveAttribute(
      "href",
      "/core/events/event-1/host",
    );
    expect(rpc).toHaveBeenCalledWith("sontu_event_hub", { event_id: "event-1" });
  });
});
