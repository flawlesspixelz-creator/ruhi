import { describe, expect, it } from "vitest";
import { applyListState, filterDocuments, sortDocuments } from "./documentList";
import { DEFAULT_LIST_STATE, PAGE_SIZE } from "./listState";
import { makeDocument } from "../test/fixtures";

const state = (overrides: Partial<typeof DEFAULT_LIST_STATE> = {}) => ({
  ...DEFAULT_LIST_STATE,
  ...overrides,
});

describe("filterDocuments", () => {
  const docs = [
    makeDocument({
      id: "a",
      title: "MSA Renewal",
      customer: "Northwind",
      status: "draft",
      documentType: "Contract",
      owner: { id: "u1", name: "Alice Johnson" },
      createdDate: "2026-06-01T09:00:00.000Z",
    }),
    makeDocument({
      id: "b",
      title: "June Invoice",
      customer: "Contoso",
      status: "pending_approval",
      documentType: "Invoice",
      owner: { id: "u4", name: "Dana Patel" },
      createdDate: "2026-06-15T12:00:00.000Z",
    }),
  ];

  it("matches the search text against title, customer, and owner, case-insensitively", () => {
    expect(filterDocuments(docs, state({ q: "msa" }))).toHaveLength(1);
    expect(filterDocuments(docs, state({ q: "CONTOSO" }))).toHaveLength(1);
    expect(filterDocuments(docs, state({ q: "dana" }))).toHaveLength(1);
    expect(filterDocuments(docs, state({ q: "nothing" }))).toHaveLength(0);
  });

  it("filters by status, type, and owner", () => {
    expect(filterDocuments(docs, state({ status: "pending_approval" }))).toEqual([docs[1]]);
    expect(filterDocuments(docs, state({ type: "Contract" }))).toEqual([docs[0]]);
    expect(filterDocuments(docs, state({ owner: "u4" }))).toEqual([docs[1]]);
  });

  it("treats the created-date range as inclusive on both ends", () => {
    expect(
      filterDocuments(docs, state({ from: "2026-06-01", to: "2026-06-01" })),
    ).toEqual([docs[0]]);
    expect(filterDocuments(docs, state({ from: "2026-06-02" }))).toEqual([docs[1]]);
    expect(filterDocuments(docs, state({ to: "2026-05-31" }))).toHaveLength(0);
  });

  it("combines filters with AND semantics", () => {
    expect(
      filterDocuments(docs, state({ q: "invoice", status: "draft" })),
    ).toHaveLength(0);
  });

  it("applies the range against UTC day boundaries, not the viewer's timezone", () => {
    // Upper bound: 23:59Z on the 15th is inside `to=2026-06-15`; 00:30Z on the
    // 16th is not. These hold in any runner timezone because both the document
    // instant and the boundary are absolute UTC.
    const upper = [
      makeDocument({ id: "late", createdDate: "2026-06-15T23:59:00.000Z" }),
      makeDocument({ id: "next", createdDate: "2026-06-16T00:30:00.000Z" }),
    ];
    expect(filterDocuments(upper, state({ to: "2026-06-15" })).map((d) => d.id)).toEqual([
      "late",
    ]);

    // Lower bound: the very start of the 15th (UTC) is included; the end of the
    // 14th is not.
    const lower = [
      makeDocument({ id: "prev", createdDate: "2026-06-14T23:30:00.000Z" }),
      makeDocument({ id: "start", createdDate: "2026-06-15T00:00:00.000Z" }),
    ];
    expect(filterDocuments(lower, state({ from: "2026-06-15" })).map((d) => d.id)).toEqual([
      "start",
    ]);
  });
});

describe("sortDocuments", () => {
  it("sorts priority by business rank, not alphabetically", () => {
    const docs = [
      makeDocument({ id: "m", priority: "Medium" }),
      makeDocument({ id: "h", priority: "High" }),
      makeDocument({ id: "l", priority: "Low" }),
    ];
    const sorted = sortDocuments(docs, state({ sort: "priority", dir: "asc" }));
    expect(sorted.map((d) => d.priority)).toEqual(["Low", "Medium", "High"]);
  });

  it("always sorts documents without a due date last", () => {
    const docs = [
      makeDocument({ id: "none", dueDate: null }),
      makeDocument({ id: "late", dueDate: "2026-08-01T00:00:00.000Z" }),
      makeDocument({ id: "soon", dueDate: "2026-07-01T00:00:00.000Z" }),
    ];
    const asc = sortDocuments(docs, state({ sort: "dueDate", dir: "asc" }));
    expect(asc.map((d) => d.id)).toEqual(["soon", "late", "none"]);
    const desc = sortDocuments(docs, state({ sort: "dueDate", dir: "desc" }));
    expect(desc.map((d) => d.id)).toEqual(["late", "soon", "none"]);
  });

  it("breaks ties deterministically so pagination stays stable", () => {
    const docs = [
      makeDocument({ id: "b", title: "Same" }),
      makeDocument({ id: "a", title: "Same" }),
    ];
    const sorted = sortDocuments(docs, state({ sort: "title", dir: "asc" }));
    expect(sorted.map((d) => d.id)).toEqual(["a", "b"]);
  });
});

describe("applyListState pagination", () => {
  const docs = Array.from({ length: PAGE_SIZE + 2 }, (_, i) =>
    makeDocument({ id: `p${i}`, title: `Doc ${i}` }),
  );

  it("returns one page of results with totals", () => {
    const result = applyListState(docs, state());
    expect(result.items).toHaveLength(PAGE_SIZE);
    expect(result.totalItems).toBe(PAGE_SIZE + 2);
    expect(result.totalPages).toBe(2);
  });

  it("clamps an out-of-range page instead of showing an empty page", () => {
    const result = applyListState(docs, state({ page: 99 }));
    expect(result.page).toBe(2);
    expect(result.items).toHaveLength(2);
  });

  it("returns page 1 with zero items for an empty result set", () => {
    const result = applyListState([], state({ page: 3 }));
    expect(result).toMatchObject({ page: 1, totalItems: 0, totalPages: 1 });
  });
});
