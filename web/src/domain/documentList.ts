import type { ApprovalDocument } from "../types/document";
import { PAGE_SIZE, type DocumentListState } from "./listState";

export interface DocumentListResult {
  /** Documents for the current page. */
  items: ApprovalDocument[];
  /** Total documents after filtering (across all pages). */
  totalItems: number;
  totalPages: number;
  /** Effective page after clamping into the valid range. */
  page: number;
}

const PRIORITY_ORDER: Record<string, number> = { Low: 0, Medium: 1, High: 2 };
const STATUS_ORDER: Record<string, number> = {
  draft: 0,
  pending_approval: 1,
  approved: 2,
  rejected: 3,
};

function matchesQuery(doc: ApprovalDocument, q: string): boolean {
  const needle = q.trim().toLowerCase();
  if (!needle) return true;
  return (
    doc.title.toLowerCase().includes(needle) ||
    doc.customer.toLowerCase().includes(needle) ||
    doc.owner.name.toLowerCase().includes(needle)
  );
}

function withinDateRange(doc: ApprovalDocument, from: string, to: string): boolean {
  // Boundaries are parsed as UTC (not local time) so the filter's edges don't
  // shift with the viewer's timezone relative to createdDate's UTC instant.
  const created = new Date(doc.createdDate).getTime();
  if (from && created < new Date(`${from}T00:00:00.000Z`).getTime()) return false;
  if (to && created > new Date(`${to}T23:59:59.999Z`).getTime()) return false;
  return true;
}

export function filterDocuments(
  docs: ApprovalDocument[],
  state: DocumentListState,
): ApprovalDocument[] {
  return docs.filter(
    (doc) =>
      matchesQuery(doc, state.q) &&
      (!state.status || doc.status === state.status) &&
      (!state.type || doc.documentType === state.type) &&
      (!state.owner || doc.owner.id === state.owner) &&
      withinDateRange(doc, state.from, state.to),
  );
}

/**
 * A due date's sortable timestamp, or null when absent. An unparseable date
 * string is treated the same as a missing one, so the comparator stays
 * symmetric (a broken value must not make cmp(a,b) and cmp(b,a) agree in
 * sign, which would leave the sort order dependent on input order).
 */
function dueTime(value: string | null): number | null {
  if (!value) return null;
  const time = new Date(value).getTime();
  return Number.isNaN(time) ? null : time;
}

/** Sortable timestamp with a stable fallback for unparseable input. */
function safeTime(value: string): number {
  const time = new Date(value).getTime();
  return Number.isNaN(time) ? 0 : time;
}

export function sortDocuments(
  docs: ApprovalDocument[],
  state: DocumentListState,
): ApprovalDocument[] {
  const dir = state.dir === "asc" ? 1 : -1;
  return [...docs].sort((a, b) => {
    let cmp = 0;
    switch (state.sort) {
      case "title":
        cmp = a.title.localeCompare(b.title, undefined, { sensitivity: "base" });
        break;
      case "customer":
        cmp = a.customer.localeCompare(b.customer, undefined, { sensitivity: "base" });
        break;
      case "priority":
        // Unknown values rank together after the known ones instead of
        // producing NaN, which would silently disable the whole sort.
        cmp =
          (PRIORITY_ORDER[a.priority] ?? Number.MAX_SAFE_INTEGER) -
          (PRIORITY_ORDER[b.priority] ?? Number.MAX_SAFE_INTEGER);
        break;
      case "status":
        cmp =
          (STATUS_ORDER[a.status] ?? Number.MAX_SAFE_INTEGER) -
          (STATUS_ORDER[b.status] ?? Number.MAX_SAFE_INTEGER);
        break;
      case "dueDate": {
        const timeA = dueTime(a.dueDate);
        const timeB = dueTime(b.dueDate);
        // Documents without a (valid) due date always sort last, regardless
        // of direction; among themselves they fall through to the tie-break.
        if (timeA === null && timeB === null) {
          cmp = 0;
          break;
        }
        if (timeA === null) return 1;
        if (timeB === null) return -1;
        cmp = timeA - timeB;
        break;
      }
      case "createdDate":
      default:
        cmp = safeTime(a.createdDate) - safeTime(b.createdDate);
        break;
    }
    if (cmp !== 0) return cmp * dir;
    // Stable tie-break so pagination never shuffles.
    return a.id.localeCompare(b.id);
  });
}

/**
 * Filter, sort, and paginate in one pass; the page is clamped into range.
 * `pageSize` defaults to the static PAGE_SIZE but callers may pass a size
 * computed from the available viewport height instead.
 */
export function applyListState(
  docs: ApprovalDocument[],
  state: DocumentListState,
  pageSize: number = PAGE_SIZE,
): DocumentListResult {
  const filtered = sortDocuments(filterDocuments(docs, state), state);
  const totalItems = filtered.length;
  const totalPages = Math.max(1, Math.ceil(totalItems / pageSize));
  const page = Math.min(Math.max(1, state.page), totalPages);
  const start = (page - 1) * pageSize;
  return {
    items: filtered.slice(start, start + pageSize),
    totalItems,
    totalPages,
    page,
  };
}
