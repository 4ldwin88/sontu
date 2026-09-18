import { describe, it, expect } from "vitest";
import {
  canAttemptCheckIn,
  checkInAdmissionLabel,
  duplicateEventDraftInput,
  participantExportCsv,
  settlement,
  providerOutcome,
  validateTimeChange,
} from "../packages/domain/coordination";
import { calendarFilename, eventCalendarText } from "../packages/domain/calendar";
import {
  attributionFromSearch,
  cleanTelemetryMetadata,
} from "../packages/data/telemetry";
describe("coordination projection semantics", () => {
  it("never labels eleven of twelve outcomes settled", () =>
    expect(
      settlement([
        ...Array(10).fill("RECONFIRMED"),
        "RELEASED_DECLINED",
        "AWAITING_RESPONSE",
      ]),
    ).toEqual({ total: 12, terminal: 11, unresolved: 1, settled: false }));
  it("release is a terminal outcome, silence is not", () => {
    expect(settlement(["RECONFIRMED", "RELEASED_DECLINED"]).settled).toBe(true);
    expect(settlement([]).settled).toBe(false);
  });
  it("provider confirmation for an old version is stale", () =>
    expect(
      providerOutcome(
        {
          id: "e",
          observed_status: "CONFIRMED",
          applicable_event_version_id: "old",
          authoritative_at: "",
          source_kind: "SIMULATED_PROVIDER",
          external_evidence_id: "1",
        },
        "new",
      ),
    ).toBe("STALE"));
  it("time changes preserve a valid event interval", () => {
    expect(validateTimeChange("bad", "bad")).toBe(false);
    expect(validateTimeChange("2026-09-16T20:00Z", "2026-09-16T19:00Z")).toBe(
      false,
    );
  });
  it("only permits valid or already-used admissions during check-in", () => {
    expect(canAttemptCheckIn("IN_PROGRESS", "VALID")).toBe(true);
    expect(canAttemptCheckIn("IN_PROGRESS", "USED")).toBe(true);
    expect(canAttemptCheckIn("IN_PROGRESS", "PENDING")).toBe(false);
    expect(canAttemptCheckIn("PUBLISHED", "VALID")).toBe(false);
    expect(canAttemptCheckIn("IN_PROGRESS", null)).toBe(false);
  });
  it("gives operators an authoritative admission reason", () => {
    expect(checkInAdmissionLabel("VALID", null)).toBe("Valid admission");
    expect(checkInAdmissionLabel("REFUNDED_INVALID", null)).toBe(
      "Invalid after refund",
    );
    expect(checkInAdmissionLabel("CANCELLED_EVENT_INVALID", null)).toBe(
      "Invalid — event cancelled",
    );
    expect(checkInAdmissionLabel("USED", "2030-09-16T23:10:00Z")).toBe(
      "Checked in",
    );
  });
  it("exports participant rows without corrupting commas or revoked-link state", () => {
    expect(
      participantExportCsv(
        [
          {
            id: "p1",
            display_name: 'Ada, "Ace"',
            invitation_email: "ada@example.com",
            commitment_state: "CONFIRMED",
            invitation_state: "ACCEPTED",
            link_revoked: true,
            plus_one_allowance: 2,
            response: null,
            admission_status: "VALID",
          },
        ],
        { includeEmail: true },
      ),
    ).toBe(
      'name,email,commitment,invitation,response,admission,guest_places,private_link\n"Ada, ""Ace""",ada@example.com,CONFIRMED,ACCEPTED,,VALID,2,revoked',
    );
  });
  it("builds a bounded duplicate draft payload from an event version", () => {
    const copy = duplicateEventDraftInput({
      id: "v1",
      version_number: 2,
      title: "A".repeat(200),
      description: "Bring snacks",
      starts_at: "2030-01-01T20:00:00Z",
      ends_at: "2030-01-01T22:00:00Z",
      timezone: "America/Toronto",
      venue_label: "Room A",
      cover_key: "upload:user/event/cover.webp",
      capacity: 24,
      materiality_class: "INITIAL",
    });
    expect(copy.title).toHaveLength(120);
    expect(copy.capacity).toBe("24");
    expect(copy.cover_key).toBe("upload:user/event/cover.webp");
  });
  it("builds safe calendar exports", () => {
    const text = eventCalendarText({
      id: "event-1",
      title: "Dinner, planning; next steps",
      description: "Line one\nLine two",
      starts_at: "2030-01-01T20:00:00.000Z",
      ends_at: null,
      venue_label: "Room A, Table 1",
      url: "https://sontu.cc/event/event-1",
      generated_at: "2030-01-01T19:00:00.000Z",
    });
    expect(text).toContain("BEGIN:VCALENDAR");
    expect(text).toContain("UID:event-1@sontu.cc");
    expect(text).toContain("DTSTART:20300101T200000Z");
    expect(text).toContain("DTEND:20300101T210000Z");
    expect(text).toContain("SUMMARY:Dinner\\, planning\\; next steps");
    expect(text).toContain("DESCRIPTION:Line one\\nLine two");
    expect(text).toContain("LOCATION:Room A\\, Table 1");
    expect(calendarFilename(" Dinner, planning; next steps ")).toBe(
      "Dinner-planning-next-steps.ics",
    );
  });
  it("keeps attribution measurable without leaking sensitive telemetry", () => {
    expect(
      attributionFromSearch(
        "?utm_source=flyer&utm_medium=qr&utm_campaign=fall&token=secret&email=jay@example.com",
      ),
    ).toEqual({
      utm_source: "flyer",
      utm_medium: "qr",
      utm_campaign: "fall",
    });
    expect(
      cleanTelemetryMetadata({
        route: "invitation",
        invite_url: "https://sontu.cc/invite/abc",
        email: "jay@example.com",
        token: "private-token",
        count: 1,
      }),
    ).toEqual({ route: "invitation", count: 1 });
  });
});
