import type { DocumentType, Priority } from "../types/document";
import { isValidDateInputValue } from "../utils/format";

export const MAX_PDF_BYTES = 10 * 1024 * 1024;

export interface DocumentFormValues {
  title: string;
  customer: string;
  documentType: DocumentType | "";
  priority: Priority | "";
  description: string;
  approverIds: string[];
  dueDate: string; // yyyy-mm-dd or empty
}

export type DocumentFormErrors = Partial<
  Record<keyof DocumentFormValues | "file", string>
>;

/** Truncate an ISO timestamp or date string to a comparable yyyy-mm-dd. */
function toDateOnly(value: string): string {
  return value.slice(0, 10);
}

/**
 * Validate the document form. Returns a map of field -> i18n error key so the
 * rules stay testable without rendering and the UI stays translatable.
 *
 * @param createdDate ISO date the record was (or will be) created; the due
 * date must not be earlier than it.
 */
export function validateDocumentForm(
  values: DocumentFormValues,
  createdDate: string,
): DocumentFormErrors {
  const errors: DocumentFormErrors = {};

  if (!values.title.trim()) errors.title = "form.errors.titleRequired";
  if (!values.customer.trim()) errors.customer = "form.errors.customerRequired";
  if (!values.documentType) errors.documentType = "form.errors.typeRequired";
  if (!values.priority) errors.priority = "form.errors.priorityRequired";
  if (values.approverIds.length === 0) {
    errors.approverIds = "form.errors.approversRequired";
  }

  if (values.dueDate) {
    // Shape alone isn't enough: browsers let impossible dates like
    // 2027-02-29 through keyboard entry in <input type="date">, so the
    // value must also exist on the calendar.
    if (!/^\d{4}-\d{2}-\d{2}$/.test(values.dueDate) || !isValidDateInputValue(values.dueDate)) {
      errors.dueDate = "form.errors.dueDateInvalid";
    } else if (values.dueDate < toDateOnly(createdDate)) {
      errors.dueDate = "form.errors.dueDateBeforeCreated";
    }
  }

  return errors;
}

/**
 * Validate a candidate attachment before upload.
 * Returns an i18n error key, or null when the file is acceptable.
 */
export function validatePdfFile(file: Pick<File, "type" | "size">): string | null {
  if (file.type !== "application/pdf") return "form.errors.fileNotPdf";
  if (file.size > MAX_PDF_BYTES) return "form.errors.fileTooLarge";
  if (file.size === 0) return "form.errors.fileEmpty";
  return null;
}
