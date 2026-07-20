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

  it("keeps sorting the known priorities even when an unknown value appears", () => {
    // An unknown rank must not produce NaN comparisons, which would leave
    // the whole array in input order. Unknowns rank after the known values.
    const docs = [
      makeDocument({ id: "h", priority: "High" }),
      makeDocument({ id: "u", priority: "Urgent" as never }),
      makeDocument({ id: "l", priority: "Low" }),
    ];
    const sorted = sortDocuments(docs, state({ sort: "priority", dir: "asc" }));
    expect(sorted.map((d) => d.id)).toEqual(["l", "h", "u"]);
  });

  it("orders an unparseable due date like a missing one, independent of input order", () => {
    // The comparator must be symmetric: cmp(a,b) and cmp(b,a) have to agree,
    // or the result depends on the order documents arrived from the server.
    const docs = [
      makeDocument({ id: "bad", dueDate: "not-a-date" }),
      makeDocument({ id: "ok", dueDate: "2026-07-01T00:00:00.000Z" }),
      makeDocument({ id: "none", dueDate: null }),
    ];
    const forward = sortDocuments(docs, state({ sort: "dueDate", dir: "asc" }));
    const backward = sortDocuments([...docs].reverse(), state({ sort: "dueDate", dir: "asc" }));
    expect(forward.map((d) => d.id)).toEqual(backward.map((d) => d.id));
    expect(forward[0].id).toBe("ok");
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
