import { useState } from "react";
import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { useDocumentsQuery, useUsersQuery } from "../hooks/useDocuments";
import { useUrlListState } from "../hooks/useUrlListState";
import { useDynamicPageSize } from "../hooks/useDynamicPageSize";
import { useCurrentUser } from "../context/CurrentUserContext";
import { applyListState } from "../domain/documentList";
import { canCreateDocument, getAvailableActions } from "../domain/permissions";
import { PAGE_SIZE, type DocumentListState, type SortField } from "../domain/listState";
import type { ApprovalDocument, DocumentStatus, DocumentType } from "../types/document";
import type { CurrentUser } from "../types/user";
import { StatusBadge } from "../components/StatusBadge";
import { EmptyState, ErrorState, LoadingState } from "../components/Feedback";
import { Pagination } from "../components/Pagination";
import { QuickApproveReject } from "../components/QuickApproveReject";
import { formatDate, isValidDateInputValue } from "../utils/format";

const STATUS_OPTIONS: DocumentStatus[] = [
  "draft",
  "pending_approval",
  "approved",
  "rejected",
];
const TYPE_OPTIONS: DocumentType[] = [
  "Contract",
  "Invoice",
  "Proposal",
  "Report",
  "Policy",
  "Other",
];
const SORTABLE_COLUMNS: { field: SortField; labelKey: string }[] = [
  { field: "title", labelKey: "list.col.title" },
  { field: "customer", labelKey: "list.col.customer" },
  { field: "status", labelKey: "list.col.status" },
  { field: "priority", labelKey: "list.col.priority" },
  { field: "createdDate", labelKey: "list.col.created" },
  { field: "dueDate", labelKey: "list.col.due" },
];

export function DocumentListPage() {
  const { t, i18n } = useTranslation();
  const { currentUser } = useCurrentUser();
  const { state, update, reset } = useUrlListState();
  const documentsQuery = useDocumentsQuery();
  const usersQuery = useUsersQuery();

  const canCreate = canCreateDocument(currentUser);

  const hasActiveFilters = Boolean(
    state.q || state.status || state.type || state.owner || state.from || state.to,
  );

  const toggleSort = (field: SortField) => {
    if (state.sort === field) {
      update({ dir: state.dir === "asc" ? "desc" : "asc" });
    } else {
      update({ sort: field, dir: field === "createdDate" ? "desc" : "asc" });
    }
  };

  return (
    <section>
      <div className="page-heading">
        <h1>{t("list.heading")}</h1>
        {canCreate ? (
          <Link to="/documents/new" className="button button--primary">
            {t("list.newDocument")}
          </Link>
        ) : null}
      </div>

      <ListFilters
        state={state}
        update={update}
        reset={reset}
        hasActiveFilters={hasActiveFilters}
        owners={usersQuery.data ?? []}
      />

      {documentsQuery.isPending ? (
        <LoadingState />
      ) : documentsQuery.isError ? (
        <ErrorState
          title={t("list.error.title")}
          message={documentsQuery.error.message}
          onRetry={() => documentsQuery.refetch()}
        />
      ) : (
        <ListResults
          state={state}
          update={update}
          toggleSort={toggleSort}
          hasActiveFilters={hasActiveFilters}
          locale={i18n.language}
          documents={documentsQuery.data}
          currentUser={currentUser}
        />
      )}
    </section>
  );
}

function ListFilters({
  state,
  update,
  reset,
  hasActiveFilters,
  owners,
}: {
  state: DocumentListState;
  update: (patch: Partial<DocumentListState>) => void;
  reset: () => void;
  hasActiveFilters: boolean;
  owners: { id: string; name: string }[];
}) {
  const { t } = useTranslation();
  const [dateErrors, setDateErrors] = useState<{ from?: string; to?: string }>({});

  // Native <input type="date"> reports its own constraint violations via
  // validity.badInput (surfaced through validity.valid) while the user is
  // still editing an unparsable combination (e.g. day 31 in February). Some
  // browsers only finalize that check once focus leaves the control, so we
  // validate on both change and blur, and additionally re-check any value
  // that does slip through with our own calendar round-trip.
  const validateDate = (field: "from" | "to", el: HTMLInputElement): boolean => {
    const isInvalid = !el.validity.valid || (el.value !== "" && !isValidDateInputValue(el.value));
    setDateErrors((prev) => ({ ...prev, [field]: isInvalid ? t("list.invalidDate") : undefined }));
    return isInvalid;
  };

  const handleDateChange = (field: "from" | "to") => (e: React.ChangeEvent<HTMLInputElement>) => {
    const el = e.target;
    if (validateDate(field, el)) return;
    update({ [field]: el.value } as Partial<DocumentListState>);
  };

  const handleDateBlur = (field: "from" | "to") => (e: React.FocusEvent<HTMLInputElement>) => {
    validateDate(field, e.target);
  };

  return (
    <form className="list-filters" role="search" onSubmit={(e) => e.preventDefault()}>
      <div className="list-filters__search">
        <label htmlFor="list-search">{t("list.searchLabel")}</label>
        <input
          id="list-search"
          type="search"
          value={state.q}
          placeholder={t("list.searchPlaceholder")}
          onChange={(e) => update({ q: e.target.value })}
        />
      </div>

      <div className="list-filters__row">
        <label>
          {t("list.status")}
          <select
            value={state.status}
            onChange={(e) => update({ status: e.target.value as DocumentStatus | "" })}
          >
            <option value="">{t("list.anyStatus")}</option>
            {STATUS_OPTIONS.map((status) => (
              <option key={status} value={status}>
                {t(`status.${status}`)}
              </option>
            ))}
          </select>
          <p className="form-field__error-slot" aria-hidden="true" />
        </label>

        <label>
          {t("list.type")}
          <select
            value={state.type}
            onChange={(e) => update({ type: e.target.value as DocumentType | "" })}
          >
            <option value="">{t("list.anyType")}</option>
            {TYPE_OPTIONS.map((type) => (
              <option key={type} value={type}>
                {t(`docType.${type}`)}
              </option>
            ))}
          </select>
          <p className="form-field__error-slot" aria-hidden="true" />
        </label>

        <label>
          {t("list.owner")}
          <select value={state.owner} onChange={(e) => update({ owner: e.target.value })}>
            <option value="">{t("list.anyOwner")}</option>
            {owners.map((owner) => (
              <option key={owner.id} value={owner.id}>
                {owner.name}
              </option>
            ))}
          </select>
          <p className="form-field__error-slot" aria-hidden="true" />
        </label>

        <label>
          {t("list.from")}
          <input
            type="date"
            value={state.from}
            max={state.to || undefined}
            aria-invalid={dateErrors.from ? true : undefined}
            onChange={handleDateChange("from")}
            onBlur={handleDateBlur("from")}
          />
          <p
            className="form-field__error form-field__error-slot"
            role={dateErrors.from ? "alert" : undefined}
          >
            {dateErrors.from}
          </p>
        </label>

        <label>
          {t("list.to")}
          <input
            type="date"
            value={state.to}
            min={state.from || undefined}
            aria-invalid={dateErrors.to ? true : undefined}
            onChange={handleDateChange("to")}
            onBlur={handleDateBlur("to")}
          />
          <p
            className="form-field__error form-field__error-slot"
            role={dateErrors.to ? "alert" : undefined}
          >
            {dateErrors.to}
          </p>
        </label>

        {hasActiveFilters ? (
          // Mirror a filter field's structure (control + reserved error slot)
          // so the row's align-items:end lines the button up with the inputs
          // rather than the fields' baseline below their reserved slots.
          <div className="list-filters__action">
            <button type="button" className="button" onClick={reset}>
              {t("list.clearFilters")}
            </button>
            <p className="form-field__error-slot" aria-hidden="true" />
          </div>
        ) : null}
      </div>
    </form>
  );
}

function ListResults({
  state,
  update,
  toggleSort,
  hasActiveFilters,
  locale,
  documents,
  currentUser,
}: {
  state: DocumentListState;
  update: (patch: Partial<DocumentListState>) => void;
  toggleSort: (field: SortField) => void;
  hasActiveFilters: boolean;
  locale: string;
  documents: ApprovalDocument[];
  currentUser: CurrentUser;
}) {
  const { t } = useTranslation();
  const { tableRef, pageSize } = useDynamicPageSize(PAGE_SIZE);
  const result = applyListState(documents, state, pageSize);
  // Only an approver can ever see approve/reject on any row, so gate the
  // whole column on role rather than having it flicker in and out per page.
  const showActionsColumn = currentUser.role === "approver";

  if (result.totalItems === 0) {
    return hasActiveFilters ? (
      <EmptyState title={t("list.emptyFiltered.title")} body={t("list.emptyFiltered.body")} />
    ) : (
      <EmptyState title={t("list.empty.title")} body={t("list.empty.body")} />
    );
  }

  const ariaSort = (field: SortField) =>
    state.sort === field ? (state.dir === "asc" ? "ascending" : "descending") : undefined;

  return (
    <>
      <div className="list-meta">
        <p role="status">{t("list.results", { count: result.totalItems })}</p>
        <label className="list-sort-mobile">
          {t("list.sortBy")}
          <select
            value={`${state.sort}:${state.dir}`}
            onChange={(e) => {
              const [sort, dir] = e.target.value.split(":");
              update({ sort: sort as SortField, dir: dir as DocumentListState["dir"] });
            }}
          >
            {SORTABLE_COLUMNS.flatMap(({ field, labelKey }) =>
              (["asc", "desc"] as const).map((dir) => (
                <option key={`${field}:${dir}`} value={`${field}:${dir}`}>
                  {t(labelKey)} · {t(dir === "asc" ? "list.sortAsc" : "list.sortDesc")}
                </option>
              )),
            )}
          </select>
        </label>
      </div>

      {/* Explicit ARIA table roles: the card layout below 720px switches
          the elements to display:block, which strips their implicit table
          semantics — the roles keep row/cell navigation working in screen
          readers at every viewport. */}
      <table ref={tableRef} className="document-table" role="table">
        <thead role="rowgroup">
          <tr role="row">
            {SORTABLE_COLUMNS.map(({ field, labelKey }) => (
              <th key={field} scope="col" role="columnheader" aria-sort={ariaSort(field)}>
                <button type="button" className="table-sort" onClick={() => toggleSort(field)}>
                  {t(labelKey)}
                  {state.sort === field ? (
                    <span aria-hidden="true">{state.dir === "asc" ? " ↑" : " ↓"}</span>
                  ) : null}
                </button>
              </th>
            ))}
            <th scope="col" role="columnheader">{t("list.col.type")}</th>
            <th scope="col" role="columnheader">{t("list.col.owner")}</th>
            {showActionsColumn ? (
              <th scope="col" role="columnheader">{t("list.col.actions")}</th>
            ) : null}
          </tr>
        </thead>
        <tbody role="rowgroup">
          {result.items.map((doc) => (
            <tr key={doc.id} role="row">
              <td role="cell" data-label={t("list.col.title")}>
                <Link to={`/documents/${doc.id}`} className="document-table__title">
                  {doc.title}
                </Link>
              </td>
              <td role="cell" data-label={t("list.col.customer")}>{doc.customer}</td>
              <td role="cell" data-label={t("list.col.status")}>
                <StatusBadge status={doc.status} />
              </td>
              <td role="cell" data-label={t("list.col.priority")}>{t(`priority.${doc.priority}`)}</td>
              <td role="cell" data-label={t("list.col.created")}>{formatDate(doc.createdDate, locale)}</td>
              <td role="cell" data-label={t("list.col.due")}>
                {doc.dueDate ? formatDate(doc.dueDate, locale) : t("common.none")}
              </td>
              <td role="cell" data-label={t("list.col.type")}>{t(`docType.${doc.documentType}`)}</td>
              <td role="cell" data-label={t("list.col.owner")}>{doc.owner.name}</td>
              {showActionsColumn ? (
                <td role="cell" data-label={t("list.col.actions")}>
                  {getAvailableActions(doc, currentUser).includes("approve") ? (
                    <QuickApproveReject document={doc} />
                  ) : null}
                </td>
              ) : null}
            </tr>
          ))}
        </tbody>
      </table>

      <Pagination
        page={result.page}
        totalPages={result.totalPages}
        onPageChange={(page) => update({ page })}
      />
    </>
  );
}
