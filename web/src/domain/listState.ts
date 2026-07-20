import type { DocumentStatus, DocumentType } from "../types/document";
import { isValidDateInputValue } from "../utils/format";

export type SortField =
  | "createdDate"
  | "dueDate"
  | "title"
  | "customer"
  | "priority"
  | "status";

export type SortDirection = "asc" | "desc";

export interface DocumentListState {
  q: string;
  status: DocumentStatus | "";
  type: DocumentType | "";
  owner: string;
  from: string; // yyyy-mm-dd, inclusive
  to: string; // yyyy-mm-dd, inclusive
  sort: SortField;
  dir: SortDirection;
  page: number;
}

export const PAGE_SIZE = 5;

export const DEFAULT_LIST_STATE: DocumentListState = {
  q: "",
  status: "",
  type: "",
  owner: "",
  from: "",
  to: "",
  sort: "createdDate",
  dir: "desc",
  page: 1,
};

const STATUS_VALUES: DocumentStatus[] = [
  "draft",
  "pending_approval",
  "approved",
  "rejected",
];

// The brief's example URL uses `status=pending`; accept friendly aliases.
const STATUS_ALIASES: Record<string, DocumentStatus> = {
  pending: "pending_approval",
};

const TYPE_VALUES: DocumentType[] = [
  "Contract",
  "Invoice",
  "Proposal",
  "Report",
  "Policy",
  "Other",
];

const SORT_VALUES: SortField[] = [
  "createdDate",
  "dueDate",
  "title",
  "customer",
  "priority",
  "status",
];

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

function parseDate(raw: string): string {
  return DATE_PATTERN.test(raw) && isValidDateInputValue(raw) ? raw : "";
}

function parseStatus(raw: string | null): DocumentStatus | "" {
  if (!raw) return "";
  // Object.hasOwn: a plain-object lookup would also match prototype keys, so
  // `?status=constructor` would smuggle Object.prototype members through as
  // a "valid" status and corrupt the state (and the re-serialized URL).
  if (Object.hasOwn(STATUS_ALIASES, raw)) return STATUS_ALIASES[raw];
  return STATUS_VALUES.includes(raw as DocumentStatus) ? (raw as DocumentStatus) : "";
}

/** Parse URL search params into a valid list state, ignoring junk values. */
export function parseListState(params: URLSearchParams): DocumentListState {
  const rawType = params.get("type") ?? "";
  const rawSort = params.get("sort") ?? "";
  const rawDir = params.get("dir") ?? "";
  const rawPage = Number.parseInt(params.get("page") ?? "", 10);
  const rawFrom = params.get("from") ?? "";
  const rawTo = params.get("to") ?? "";

  return {
    q: params.get("q") ?? "",
    status: parseStatus(params.get("status")),
    type: TYPE_VALUES.includes(rawType as DocumentType) ? (rawType as DocumentType) : "",
    owner: params.get("owner") ?? "",
    from: parseDate(rawFrom),
    to: parseDate(rawTo),
    sort: SORT_VALUES.includes(rawSort as SortField)
      ? (rawSort as SortField)
      : DEFAULT_LIST_STATE.sort,
    dir: rawDir === "asc" || rawDir === "desc" ? rawDir : DEFAULT_LIST_STATE.dir,
    page: Number.isFinite(rawPage) && rawPage > 0 ? rawPage : 1,
  };
}

/** Serialize list state to URL search params, omitting default values. */
export function serializeListState(state: DocumentListState): URLSearchParams {
  const params = new URLSearchParams();
  if (state.q) params.set("q", state.q);
  if (state.status) params.set("status", state.status);
  if (state.type) params.set("type", state.type);
  if (state.owner) params.set("owner", state.owner);
  if (state.from) params.set("from", state.from);
  if (state.to) params.set("to", state.to);
  if (state.sort !== DEFAULT_LIST_STATE.sort || state.dir !== DEFAULT_LIST_STATE.dir) {
    params.set("sort", state.sort);
    params.set("dir", state.dir);
  }
  if (state.page > 1) params.set("page", String(state.page));
  return params;
}
