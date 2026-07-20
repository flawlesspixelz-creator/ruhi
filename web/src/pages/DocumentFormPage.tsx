import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { useCurrentUser } from "../context/CurrentUserContext";
import {
  useCreateDocument,
  useDocumentQuery,
  useUpdateDocument,
  useUsersQuery,
} from "../hooks/useDocuments";
import { useUnsavedChangesWarning } from "../hooks/useUnsavedChangesWarning";
import { uploadPdf } from "../api/documents";
import { canCreateDocument, canPerform, isEligibleApprover } from "../domain/permissions";
import {
  validateDocumentForm,
  validatePdfFile,
  type DocumentFormErrors,
  type DocumentFormValues,
} from "../domain/validation";
import type {
  ApprovalDocument,
  Attachment,
  DocumentType,
  Priority,
} from "../types/document";
import { ConfirmDialog } from "../components/ConfirmDialog";
import { ErrorState, LoadingState } from "../components/Feedback";
import { FormField } from "../components/FormField";
import { useToast } from "../components/Toast";

const TYPE_OPTIONS: DocumentType[] = [
  "Contract",
  "Invoice",
  "Proposal",
  "Report",
  "Policy",
  "Other",
];
const PRIORITY_OPTIONS: Priority[] = ["Low", "Medium", "High"];

const EMPTY_VALUES: DocumentFormValues = {
  title: "",
  customer: "",
  documentType: "",
  priority: "",
  description: "",
  approverIds: [],
  dueDate: "",
};

export function DocumentFormPage() {
  const { id } = useParams<{ id: string }>();
  const { currentUser } = useCurrentUser();
  const navigate = useNavigate();

  // Edit access to an existing document is governed per-document by the
  // permission matrix in EditFormLoader. Anyone who reaches /documents/new
  // without the create right (read-only users) is sent back rather than
  // shown a dead form.
  const canCreateNew = canCreateDocument(currentUser);
  useEffect(() => {
    if (!id && !canCreateNew) navigate("/documents", { replace: true });
  }, [id, canCreateNew, navigate]);

  if (!id) return canCreateNew ? <DocumentForm key="new" document={null} /> : null;
  return <EditFormLoader id={id} />;
}

function EditFormLoader({ id }: { id: string }) {
  const { t } = useTranslation();
  const { currentUser } = useCurrentUser();
  const navigate = useNavigate();
  const query = useDocumentQuery(id);
  const document = query.data;

  // Only drafts are editable; anything else goes back to the detail view.
  useEffect(() => {
    if (document && !canPerform("edit", document, currentUser)) {
      navigate(`/documents/${id}`, { replace: true });
    }
  }, [document, currentUser, id, navigate]);

  if (query.isPending) return <LoadingState />;
  if (query.isError) {
    return (
      <ErrorState
        title={t("detail.error.title")}
        message={query.error.message}
        onRetry={() => query.refetch()}
      />
    );
  }
  const loaded = query.data;
  if (!canPerform("edit", loaded, currentUser)) return null;
  return <DocumentForm key={loaded.id} document={loaded} />;
}

function toFormValues(document: ApprovalDocument): DocumentFormValues {
  return {
    title: document.title,
    customer: document.customer,
    documentType: document.documentType,
    priority: document.priority,
    description: document.description ?? "",
    approverIds: document.approvers.map((a) => a.id),
    dueDate: document.dueDate ? document.dueDate.slice(0, 10) : "",
  };
}

function DocumentForm({ document }: { document: ApprovalDocument | null }) {
  const isEditing = document !== null;
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { currentUser } = useCurrentUser();
  const { showToast } = useToast();
  const usersQuery = useUsersQuery();

  const initialValues = useMemo(
    () => (document ? toFormValues(document) : EMPTY_VALUES),
    [document],
  );

  const [values, setValues] = useState<DocumentFormValues>(initialValues);
  const [errors, setErrors] = useState<DocumentFormErrors>({});
  const [keptAttachments, setKeptAttachments] = useState<Attachment[]>(
    document?.attachments ?? [],
  );
  const [newFile, setNewFile] = useState<File | null>(null);
  const [uploadProgress, setUploadProgress] = useState<number | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);

  const createMutation = useCreateDocument();
  const updateMutation = useUpdateDocument(document?.id ?? "");
  const saving = createMutation.isPending || updateMutation.isPending || uploadProgress !== null;

  // The creation date anchors the due-date rule: the document's real
  // creation date when editing, today when creating.
  const createdDate = document?.createdDate ?? new Date().toISOString();
  const minDueDate = createdDate.slice(0, 10);

  const isDirty =
    JSON.stringify(values) !== JSON.stringify(initialValues) ||
    newFile !== null ||
    keptAttachments.length !== (document?.attachments?.length ?? 0);
  const dirtyRef = useRef(false);
  // The guard stays armed while a save is in flight — closing the tab
  // mid-upload would otherwise silently lose everything. The success
  // handler clears the ref itself before navigating away.
  dirtyRef.current = isDirty;
  const blocker = useUnsavedChangesWarning(dirtyRef);

  // The owner (creator on a new document, the existing owner when editing)
  // can never be one of the document's own approvers.
  const ownerId = document?.owner.id ?? currentUser.id;
  const approverOptions = (usersQuery.data ?? []).filter((u) =>
    isEligibleApprover(u, ownerId),
  );

  const setField = <K extends keyof DocumentFormValues>(
    field: K,
    value: DocumentFormValues[K],
  ) => {
    setValues((current) => ({ ...current, [field]: value }));
    setErrors((current) => ({ ...current, [field]: undefined }));
  };

  const handleFileChange = (file: File | null) => {
    setErrors((current) => ({ ...current, file: undefined }));
    if (!file) {
      setNewFile(null);
      return;
    }
    const fileError = validatePdfFile(file);
    if (fileError) {
      setErrors((current) => ({ ...current, file: fileError }));
      setNewFile(null);
      return;
    }
    setNewFile(file);
  };

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    const formElement = event.currentTarget as HTMLFormElement;
    setSaveError(null);

    const validationErrors = validateDocumentForm(values, createdDate);
    if (Object.keys(validationErrors).length > 0 || errors.file) {
      setErrors((current) => ({ ...validationErrors, file: current.file }));
      // Move focus to the first invalid control so keyboard and
      // screen-reader users land on the problem instead of perceiving a
      // submit that did nothing.
      requestAnimationFrame(() => {
        formElement.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus();
      });
      return;
    }

    // Upload first: a failed upload must never produce a document that
    // points at a missing file.
    let attachments = keptAttachments;
    if (newFile) {
      try {
        setUploadProgress(0);
        const uploaded = await uploadPdf(newFile, setUploadProgress);
        attachments = [...keptAttachments, uploaded];
      } catch (error) {
        setUploadProgress(null);
        setSaveError(
          t("form.uploadFailed", {
            message: error instanceof Error ? error.message : "",
          }),
        );
        return;
      }
      setUploadProgress(null);
    }

    const approvers = approverOptions
      .filter((u) => values.approverIds.includes(u.id))
      .map((u) => ({ id: u.id, name: u.name }));

    const draft = {
      title: values.title.trim(),
      customer: values.customer.trim(),
      documentType: values.documentType as DocumentType,
      priority: values.priority as Priority,
      // null, not undefined: JSON.stringify drops undefined keys entirely,
      // so clearing the description would silently never reach the server.
      description: values.description.trim() || null,
      approvers,
      dueDate: values.dueDate ? new Date(`${values.dueDate}T00:00:00`).toISOString() : null,
      attachments,
    };

    const onSuccess = (saved: ApprovalDocument, toastKey: string) => {
      dirtyRef.current = false;
      showToast("success", t(toastKey));
      navigate(`/documents/${saved.id}`);
    };
    const onError = (error: Error) => {
      setSaveError(t("form.saveFailed", { message: error.message }));
    };

    if (isEditing) {
      updateMutation.mutate(draft, {
        onSuccess: (saved) => onSuccess(saved, "form.updated"),
        onError,
      });
    } else {
      createMutation.mutate(
        {
          draft: {
            ...draft,
            createdDate: new Date().toISOString(),
            owner: { id: currentUser.id, name: currentUser.name },
          },
          actor: currentUser.id,
        },
        {
          onSuccess: (saved) => onSuccess(saved, "form.created"),
          onError,
        },
      );
    }
  };

  return (
    <section className="form-page">
      <h1>{isEditing ? t("form.editHeading") : t("form.createHeading")}</h1>

      <form className="document-form" onSubmit={handleSubmit} noValidate>
        <FormField label={t("form.title")} required errorKey={errors.title}>
          {(control) => (
            <input
              {...control}
              type="text"
              value={values.title}
              maxLength={200}
              onChange={(e) => setField("title", e.target.value)}
            />
          )}
        </FormField>

        <FormField label={t("form.customer")} required errorKey={errors.customer}>
          {(control) => (
            <input
              {...control}
              type="text"
              value={values.customer}
              maxLength={200}
              onChange={(e) => setField("customer", e.target.value)}
            />
          )}
        </FormField>

        <div className="document-form__row">
          <FormField label={t("form.type")} required errorKey={errors.documentType}>
            {(control) => (
              <select
                {...control}
                value={values.documentType}
                onChange={(e) => setField("documentType", e.target.value as DocumentType | "")}
              >
                <option value="">{t("form.selectOne")}</option>
                {TYPE_OPTIONS.map((type) => (
                  <option key={type} value={type}>
                    {t(`docType.${type}`)}
                  </option>
                ))}
              </select>
            )}
          </FormField>

          <FormField label={t("form.priority")} required errorKey={errors.priority}>
            {(control) => (
              <select
                {...control}
                value={values.priority}
                onChange={(e) => setField("priority", e.target.value as Priority | "")}
              >
                <option value="">{t("form.selectOne")}</option>
                {PRIORITY_OPTIONS.map((priority) => (
                  <option key={priority} value={priority}>
                    {t(`priority.${priority}`)}
                  </option>
                ))}
              </select>
            )}
          </FormField>

          <FormField label={t("form.dueDate")} errorKey={errors.dueDate}>
            {(control) => (
              <input
                {...control}
                type="date"
                value={values.dueDate}
                min={minDueDate}
                onChange={(e) => setField("dueDate", e.target.value)}
              />
            )}
          </FormField>
        </div>

        <FormField label={t("form.description")} errorKey={errors.description}>
          {(control) => (
            <textarea
              {...control}
              value={values.description}
              rows={4}
              maxLength={2000}
              onChange={(e) => setField("description", e.target.value)}
            />
          )}
        </FormField>

        <fieldset
          className={
            errors.approverIds
              ? "form-field form-field--invalid document-form__approvers"
              : "form-field document-form__approvers"
          }
        >
          <legend className="form-field__label">
            {t("form.approvers")}
            <span className="form-field__required" aria-hidden="true">
              *
            </span>
          </legend>
          <p className="form-field__hint">{t("form.approversHint")}</p>
          {approverOptions.map((user) => (
            <label key={user.id} className="checkbox-label">
              <input
                type="checkbox"
                checked={values.approverIds.includes(user.id)}
                onChange={(e) =>
                  setField(
                    "approverIds",
                    e.target.checked
                      ? [...values.approverIds, user.id]
                      : values.approverIds.filter((id) => id !== user.id),
                  )
                }
              />
              {user.name}
            </label>
          ))}
          {errors.approverIds ? (
            <p className="form-field__error">{t(errors.approverIds)}</p>
          ) : null}
        </fieldset>

        <div className="form-field">
          <span className="form-field__label">{t("form.attachment")}</span>
          <p className="form-field__hint">{t("form.attachmentHint")}</p>

          {keptAttachments.map((attachment) => (
            <p key={attachment.id} className="document-form__attachment">
              {t("form.currentAttachment")}: {attachment.name}{" "}
              <button
                type="button"
                className="button button--small"
                onClick={() =>
                  setKeptAttachments((current) =>
                    current.filter((a) => a.id !== attachment.id),
                  )
                }
              >
                {t("form.removeAttachment")}
              </button>
            </p>
          ))}

          <input
            type="file"
            accept="application/pdf"
            aria-label={t("form.attachment")}
            aria-invalid={errors.file ? true : undefined}
            onChange={(e) => handleFileChange(e.target.files?.[0] ?? null)}
          />
          {errors.file ? (
            <p className="form-field__error" role="alert">
              {t(errors.file)}
            </p>
          ) : null}
          {uploadProgress !== null ? (
            <p role="status">
              {t("form.uploading", { percent: Math.round(uploadProgress * 100) })}
            </p>
          ) : null}
        </div>

        {saveError ? (
          <p className="feedback feedback--error" role="alert">
            {saveError}
          </p>
        ) : null}

        <div className="document-form__actions">
          <button
            type="button"
            className="button"
            onClick={() =>
              navigate(isEditing ? `/documents/${document.id}` : "/documents")
            }
            disabled={saving}
          >
            {t("form.cancel")}
          </button>
          <button
            type="submit"
            className="button button--primary"
            disabled={saving}
            aria-busy={saving}
          >
            {saving ? t("form.saving") : isEditing ? t("form.save") : t("form.create")}
          </button>
        </div>
      </form>

      <ConfirmDialog
        open={blocker.state === "blocked"}
        title={t("form.unsaved.title")}
        body={t("form.unsaved.body")}
        confirmLabel={t("form.unsaved.leave")}
        cancelLabel={t("form.unsaved.stay")}
        danger
        onConfirm={() => blocker.proceed?.()}
        onCancel={() => blocker.reset?.()}
      />
    </section>
  );
}
