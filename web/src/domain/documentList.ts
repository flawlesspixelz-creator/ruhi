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

function compareNullableDates(a: string | null, b: string | null): number {
  // Documents without a due date always sort last, regardless of direction.
  if (!a && !b) return 0;
  if (!a) return Number.POSITIVE_INFINITY;
  if (!b) return Number.NEGATIVE_INFINITY;
  return new Date(a).getTime() - new Date(b).getTime();
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
        cmp = PRIORITY_ORDER[a.priority] - PRIORITY_ORDER[b.priority];
        break;
      case "status":
        cmp = STATUS_ORDER[a.status] - STATUS_ORDER[b.status];
        break;
      case "dueDate": {
        const dateCmp = compareNullableDates(a.dueDate, b.dueDate);
        if (!Number.isFinite(dateCmp)) return dateCmp > 0 ? 1 : -1;
        cmp = dateCmp;
        break;
      }
      case "createdDate":
      default:
        cmp = new Date(a.createdDate).getTime() - new Date(b.createdDate).getTime();
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
