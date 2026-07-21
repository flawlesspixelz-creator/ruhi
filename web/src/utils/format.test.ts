import { describe, expect, it } from "vitest";
import { formatDate, formatFileSize, isValidDateInputValue } from "./format";

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

describe("formatDate", () => {
  it("returns empty string for missing or unparseable input", () => {
    expect(formatDate(null, "en-US")).toBe("");
    expect(formatDate(undefined, "en-US")).toBe("");
    expect(formatDate("not-a-date", "en-US")).toBe("");
  });

  it("formats a valid ISO date for the locale", () => {
    // Assert it produces the year rather than a brittle exact string.
    expect(formatDate("2026-06-01T00:00:00.000Z", "en-US")).toMatch(/2026/);
  });
});

describe("formatFileSize", () => {
  it("returns empty string for invalid sizes", () => {
    expect(formatFileSize(Number.NaN, "en-US")).toBe("");
    expect(formatFileSize(-1, "en-US")).toBe("");
    expect(formatFileSize(Infinity, "en-US")).toBe("");
  });

  it("uses bytes below 1 kB", () => {
    expect(formatFileSize(0, "en-US")).toBe("0 B");
    expect(formatFileSize(512, "en-US")).toBe("512 B");
    expect(formatFileSize(1023, "en-US")).toBe("1023 B");
  });

  it("uses kB from 1024 bytes up to just under 1 MB", () => {
    expect(formatFileSize(1024, "en-US")).toBe("1 kB");
    expect(formatFileSize(1536, "en-US")).toBe("1.5 kB");
  });

  it("uses MB at and above 1 MB", () => {
    expect(formatFileSize(1024 * 1024, "en-US")).toBe("1 MB");
    expect(formatFileSize(10 * 1024 * 1024, "en-US")).toBe("10 MB");
  });
});
