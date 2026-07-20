import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { useCurrentUser } from "../context/CurrentUserContext";
import { useApproveDocument, useRejectDocument } from "../hooks/useDocuments";
import type { ApprovalDocument } from "../types/document";
import { ConfirmDialog } from "./ConfirmDialog";
import { useToast } from "./Toast";

type PendingAction = "approve" | "reject" | null;

function CheckIcon() {
  return (
    <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true" focusable="false">
      <path
        d="M5 12.5l4.5 4.5L19 7"
        fill="none"
        stroke="currentColor"
        strokeWidth="2.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function CrossIcon() {
  return (
    <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true" focusable="false">
      <path
        d="M6 6l12 12M18 6L6 18"
        fill="none"
        stroke="currentColor"
        strokeWidth="2.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

/**
 * Approve/reject affordance for contexts that show many documents at once
 * (the list). Mirrors DocumentDetailPage's confirm-and-mutate pattern so the
 * reason-required and failure-preserves-input behavior stays consistent
 * wherever a workflow decision is made.
 */
export function QuickApproveReject({ document }: { document: ApprovalDocument }) {
  const { t } = useTranslation();
  const { currentUser } = useCurrentUser();
  const { showToast } = useToast();

  const [pendingAction, setPendingAction] = useState<PendingAction>(null);
  const [text, setText] = useState("");
  const [reasonError, setReasonError] = useState<string | null>(null);

  const approve = useApproveDocument(document.id);
  const reject = useRejectDocument(document.id);

  // Same rule as the detail page: switching identity closes any pending
  // confirmation so an action can never fire as a user it wasn't offered to.
  useEffect(() => {
    setPendingAction(null);
    setText("");
    setReasonError(null);
  }, [currentUser.id]);
  const activeMutation =
    pendingAction === "approve" ? approve : pendingAction === "reject" ? reject : null;

  const closeDialog = () => {
    setPendingAction(null);
    setText("");
    setReasonError(null);
    approve.reset();
    reject.reset();
  };

  const runAction = () => {
    const onSuccess = (toastKey: string) => () => {
      showToast("success", t(toastKey));
      closeDialog();
    };
    if (pendingAction === "approve") {
      approve.mutate(
        { actor: currentUser.id, comment: text.trim() || undefined },
        { onSuccess: onSuccess("toast.approved") },
      );
    } else if (pendingAction === "reject") {
      if (!text.trim()) {
        setReasonError(t("detail.confirmReject.reasonRequired"));
        return;
      }
      setReasonError(null);
      reject.mutate(
        { actor: currentUser.id, reason: text.trim() },
        { onSuccess: onSuccess("toast.rejected") },
      );
    }
  };

  return (
    <div className="quick-actions">
      <button
        type="button"
        className="button button--primary button--icon"
        title={t("detail.actions.approve")}
        aria-label={t("detail.actions.approve")}
        onClick={() => setPendingAction("approve")}
      >
        <CheckIcon />
      </button>
      <button
        type="button"
        className="button button--danger button--icon"
        title={t("detail.actions.reject")}
        aria-label={t("detail.actions.reject")}
        onClick={() => setPendingAction("reject")}
      >
        <CrossIcon />
      </button>

      {pendingAction ? (
        <ConfirmDialog
          open
          title={
            pendingAction === "approve"
              ? t("detail.confirmApprove.title")
              : t("detail.confirmReject.title")
          }
          body={
            pendingAction === "approve"
              ? t("detail.confirmApprove.body", { title: document.title })
              : t("detail.confirmReject.body", { title: document.title })
          }
          confirmLabel={t(`detail.actions.${pendingAction}`)}
          cancelLabel={t("common.cancel")}
          danger={pendingAction === "reject"}
          busy={activeMutation?.isPending ?? false}
          error={
            reasonError ??
            (activeMutation?.isError
              ? t("toast.actionFailed", { message: activeMutation.error.message })
              : null)
          }
          onConfirm={runAction}
          onCancel={closeDialog}
        >
          {pendingAction === "approve" ? (
            <label className="dialog__field">
              {t("detail.confirmApprove.commentLabel")}
              <textarea value={text} onChange={(e) => setText(e.target.value)} rows={3} />
            </label>
          ) : (
            <label className="dialog__field">
              {t("detail.confirmReject.reasonLabel")}
              <textarea
                value={text}
                onChange={(e) => setText(e.target.value)}
                rows={3}
                required
                aria-invalid={reasonError ? true : undefined}
              />
            </label>
          )}
        </ConfirmDialog>
      ) : null}
    </div>
  );
}
