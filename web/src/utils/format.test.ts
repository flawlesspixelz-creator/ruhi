import { describe, expect, it } from "vitest";
import { isValidDateInputValue } from "./format";

describe("isValidDateInputValue", () => {
  it("accepts an empty value (no filter applied)", () => {
    expect(isValidDateInputValue("")).toBe(true);
  });

  it("accepts real calendar dates", () => {
    expect(isValidDateInputValue("2026-06-01")).toBe(true);
    expect(isValidDateInputValue("2024-02-29")).toBe(true); // leap year
  });

  it("rejects dates that don't exist, e.g. Feb 30", () => {
    expect(isValidDateInputValue("2026-02-30")).toBe(false);
    expect(isValidDateInputValue("2023-02-29")).toBe(false); // not a leap year
    expect(isValidDateInputValue("2026-13-01")).toBe(false);
  });

  it("rejects malformed input", () => {
    expect(isValidDateInputValue("not-a-date")).toBe(false);
    expect(isValidDateInputValue("2026-6-1")).toBe(false);
  });
});
