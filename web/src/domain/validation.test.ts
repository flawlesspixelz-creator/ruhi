import { describe, expect, it } from "vitest";
import {
  MAX_PDF_BYTES,
  validateDocumentForm,
  validatePdfFile,
  type DocumentFormValues,
} from "./validation";

const validValues: DocumentFormValues = {
  title: "MSA Renewal",
  customer: "Northwind",
  documentType: "Contract",
  priority: "High",
  description: "",
  approverIds: ["u2"],
  dueDate: "",
};

const CREATED = "2026-06-01T09:00:00.000Z";

describe("validateDocumentForm", () => {
  it("accepts a fully valid form", () => {
    expect(validateDocumentForm(validValues, CREATED)).toEqual({});
  });

  it("requires title, customer, type, priority, and at least one approver", () => {
    const errors = validateDocumentForm(
      { ...validValues, title: "  ", customer: "", documentType: "", priority: "", approverIds: [] },
      CREATED,
    );
    expect(errors).toMatchObject({
      title: "form.errors.titleRequired",
      customer: "form.errors.customerRequired",
      documentType: "form.errors.typeRequired",
      priority: "form.errors.priorityRequired",
      approverIds: "form.errors.approversRequired",
    });
  });

  it("treats the due date as optional", () => {
    expect(validateDocumentForm({ ...validValues, dueDate: "" }, CREATED)).toEqual({});
  });

  it("rejects a due date earlier than the creation date", () => {
    expect(
      validateDocumentForm({ ...validValues, dueDate: "2026-05-31" }, CREATED),
    ).toMatchObject({ dueDate: "form.errors.dueDateBeforeCreated" });
  });

  it("accepts a due date on the creation date itself (boundary)", () => {
    expect(
      validateDocumentForm({ ...validValues, dueDate: "2026-06-01" }, CREATED),
    ).toEqual({});
  });

  it("rejects dates that match the shape but don't exist on the calendar", () => {
    // <input type="date"> lets these through via keyboard entry.
    for (const dueDate of ["2027-02-29", "2026-13-45", "2026-04-31", "9999-99-99"]) {
      expect(validateDocumentForm({ ...validValues, dueDate }, CREATED)).toMatchObject({
        dueDate: "form.errors.dueDateInvalid",
      });
    }
  });

  it("accepts a leap-year February 29", () => {
    expect(
      validateDocumentForm({ ...validValues, dueDate: "2028-02-29" }, CREATED),
    ).toEqual({});
  });
});

describe("validatePdfFile", () => {
  it("accepts a PDF within the size limit", () => {
    expect(validatePdfFile({ type: "application/pdf", size: MAX_PDF_BYTES })).toBeNull();
  });

  it("rejects non-PDF MIME types", () => {
    expect(validatePdfFile({ type: "image/png", size: 100 })).toBe(
      "form.errors.fileNotPdf",
    );
  });

  it("rejects files over 10 MB (boundary: one byte over)", () => {
    expect(validatePdfFile({ type: "application/pdf", size: MAX_PDF_BYTES + 1 })).toBe(
      "form.errors.fileTooLarge",
    );
  });

  it("rejects empty files", () => {
    expect(validatePdfFile({ type: "application/pdf", size: 0 })).toBe(
      "form.errors.fileEmpty",
    );
  });
});
