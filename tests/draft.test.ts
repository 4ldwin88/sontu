import { describe, it, expect } from "vitest";
import {
  instantForWall,
  wallTime,
  draftBlockers,
  emptyDraft,
} from "../packages/domain/draft";
describe("event time and publication review", () => {
  it("uses the selected timezone independent of the device timezone", () => {
    expect(instantForWall("2030-09-16T19:00", "America/Toronto")).toBe(
      "2030-09-16T23:00:00.000Z",
    );
    expect(wallTime("2030-09-16T23:00:00Z", "America/Vancouver")).toBe(
      "2030-09-16T16:00",
    );
  });
  it("rejects nonexistent and ambiguous DST wall times", () => {
    expect(instantForWall("2026-03-08T02:30", "America/Toronto")).toBeNull();
    expect(instantForWall("2026-11-01T01:30", "America/Toronto")).toBeNull();
  });
  it("blocks publication for incomplete and past event drafts", () => {
    expect(draftBlockers(emptyDraft)).toHaveLength(4);
    expect(
      draftBlockers(
        {
          ...emptyDraft,
          title: "Dinner",
          venue_label: "Garden",
          starts_at: "2030-09-16T23:00:00Z",
          ends_at: "2030-09-17T01:00:00Z",
        },
        Date.parse("2030-09-15"),
      ),
    ).toEqual([]);
  });
});
