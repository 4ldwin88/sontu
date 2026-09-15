import { describe, it, expect } from "vitest";
import {
  canAttemptCheckIn,
  checkInAdmissionLabel,
  settlement,
  providerOutcome,
  validateTimeChange,
} from "../packages/domain/coordination";
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
});
