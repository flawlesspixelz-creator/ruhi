import { describe, expect, it } from "vitest";
import { DEFAULT_LIST_STATE, parseListState, serializeListState } from "./listState";

describe("parseListState", () => {
  it("accepts the README's short status alias (?status=pending)", () => {
    const parsed = parseListState(new URLSearchParams("status=pending&owner=u2&page=2"));
    expect(parsed.status).toBe("pending_approval");
    expect(parsed.owner).toBe("u2");
    expect(parsed.page).toBe(2);
  });

  it("ignores junk values rather than crashing or filtering on garbage", () => {
    const parsed = parseListState(
      new URLSearchParams("status=nope&type=Banana&sort=hack&dir=up&page=-3&from=xx"),
    );
    expect(parsed).toEqual(DEFAULT_LIST_STATE);
  });

  it("does not leak Object.prototype members through the status alias table", () => {
    // A plain-object alias lookup would treat "constructor"/"toString" as
    // valid aliases and return a Function as the status, silently emptying
    // the filtered list and re-serializing garbage into the URL.
    for (const key of ["constructor", "toString", "valueOf", "hasOwnProperty", "__proto__"]) {
      const parsed = parseListState(new URLSearchParams(`status=${key}`));
      expect(parsed.status).toBe("");
    }
  });

  it("round-trips through serialize and parse", () => {
    const original = {
      ...DEFAULT_LIST_STATE,
      q: "renewal",
      status: "draft" as const,
      type: "Contract" as const,
      owner: "u1",
      from: "2026-06-01",
      to: "2026-06-30",
      sort: "title" as const,
      dir: "asc" as const,
      page: 2,
    };
    expect(parseListState(serializeListState(original))).toEqual(original);
  });
});

describe("serializeListState", () => {
  it("omits defaults so shared URLs stay clean", () => {
    expect(serializeListState(DEFAULT_LIST_STATE).toString()).toBe("");
  });

  it("only includes changed values", () => {
    const params = serializeListState({ ...DEFAULT_LIST_STATE, status: "draft", page: 3 });
    expect(params.get("status")).toBe("draft");
    expect(params.get("page")).toBe("3");
    expect(params.get("q")).toBeNull();
    expect(params.get("sort")).toBeNull();
  });
});
