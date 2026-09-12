import { afterEach, expect, it } from "vitest";
import {
  clearDiagnostics,
  diagnosticEntries,
  recordDiagnostic,
} from "../packages/data/diagnostics";
afterEach(clearDiagnostics);
it("bounds diagnostic retention and records only category, time and reference", () => {
  for (let i = 0; i < 40; i++) recordDiagnostic("request_failed");
  const entries = diagnosticEntries();
  expect(entries).toHaveLength(30);
  expect(new Set(entries.map((e) => e.reference)).size).toBe(30);
  expect(Object.keys(entries[0]).sort()).toEqual(["kind", "reference", "time"]);
  clearDiagnostics();
  expect(diagnosticEntries()).toEqual([]);
});
