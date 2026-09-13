import { expect, it } from "vitest";
import { passwordChecks, safeAccountReturn } from "../packages/domain/password";
it("requires every founder password rule without treating whitespace as a symbol", () => {
  for (const p of [
    "Abcdef1",
    "abcdefgh1!",
    "ABCDEFGH1!",
    "Abcdefgh!",
    "Abcdefg1 ",
    "Aa1!",
  ])
    expect(passwordChecks(p).every((c) => c.met)).toBe(false);
  expect(passwordChecks("Eight42!").every((c) => c.met)).toBe(true);
});
it("keeps auth return destinations inside governed product routes", () => {
  for (const p of [
    "//evil.test",
    "https://evil.test",
    "/sign-in",
    "/home\\evil",
  ])
    expect(safeAccountReturn(p)).toBe("/events");
  expect(safeAccountReturn("/create/abc")).toBe("/create/abc");
});
