import { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { useCurrentUser } from "../context/CurrentUserContext";
import {
  useAddComment,
  useApproveDocument,
  useDocumentQuery,
  useRejectDocument,
  useReturnToDraft,
  useSubmitDocument,
} from "../hooks/useDocuments";
import { getAvailableActions } from "../domain/permissions";
import { ApiError } from "../api/client";
import type { ApprovalDocument } from "../types/document";
import { StatusBadge } from "../components/StatusBadge";
import { ConfirmDialog } from "../components/ConfirmDialog";
import { EmptyState, ErrorState, LoadingState } from "../components/Feedback";
import { PdfAttachmentList } from "../components/PdfAttachmentList";
import { useToast } from "../components/Toast";
import { formatDate, formatDateTime } from "../utils/format";

type PendingAction = "submit" | "approve" | "reject" | "returnToDraft" | null;

export function DocumentDetailPage() {
  const { id = "" } = useParams<{ id: string }>();
  const { t } = useTranslation();
  const query = useDocumentQuery(id);

  if (query.isPending) return <LoadingState />;

  if (query.isError) {
    if (query.error instanceof ApiError && query.error.status === 404) {
      return (
        <EmptyState
          title={t("detail.notFound.title")}
          body={
            <>
              {t("detail.notFound.body")}{" "}
              <Link to="/documents">{t("common.back")}</Link>
            </>
          }
        />
      );
    }
    return (
      <ErrorState
        title={t("detail.error.title")}
        message={query.error.message}
        onRetry={() => query.refetch()}
      />
    );
  }

  return <DocumentDetail document={query.data} />;
}

function DocumentDetail({ document }: { document: ApprovalDocument }) {
  const { t, i18n } = useTranslation();
  const locale = i18n.language;
  const { currentUser } = useCurrentUser();
  const navigate = useNavigate();
  const { showToast } = useToast();

  const [pendingAction, setPendingAction] = useState<PendingAction>(null);
  // Approve comment / reject reason live here so a failed request never
  // loses what the user typed.
  const [actionComment, setActionComment] = useState("");
  const [reasonError, setReasonError] = useState<string | null>(null);

  const submit = useSubmitDocument(document.id);
  const approve = useApproveDocument(document.id);
  const reject = useRejectDocument(document.id);
  const returnDraft = useReturnToDraft(document.id);

  const actions = getAvailableActions(document, currentUser);
  // Workflow endpoints identify the acting user by id; the server resolves
  // the display name for the audit trail (and validates approval turn order).
  const actor = currentUser.id;

  // Switching identity invalidates any confirmation opened as the previous
  // user: the new user may not even be offered the action behind the modal,
  // and confirming would fire it under their id.
  useEffect(() => {
    setPendingAction(null);
    setActionComment("");
    setReasonError(null);
  }, [currentUser.id]);

  const activeMutation =
    pendingAction === "submit"
      ? submit
      : pendingAction === "approve"
        ? approve
        : pendingAction === "reject"
          ? reject
          : pendingAction === "returnToDraft"
            ? returnDraft
            : null;

  const closeDialog = () => {
    setPendingAction(null);
    setActionComment("");
    setReasonError(null);
    submit.reset();
    approve.reset();
    reject.reset();
    returnDraft.reset();
  };

  const runAction = () => {
    const onSuccess = (toastKey: string) => () => {
      showToast("success", t(toastKey));
      closeDialog();
    };
    switch (pendingAction) {
      case "submit":
        submit.mutate({ actor }, { onSuccess: onSuccess("toast.submitted") });
        break;
      case "approve":
        approve.mutate(
          { actor, comment: actionComment.trim() || undefined },
          { onSuccess: onSuccess("toast.approved") },
        );
        break;
      case "reject": {
        if (!actionComment.trim()) {
          setReasonError(t("detail.confirmReject.reasonRequired"));
          return;
        }
        setReasonError(null);
        reject.mutate(
          { actor, reason: actionComment.trim() },
          { onSuccess: onSuccess("toast.rejected") },
        );
        break;
      }
      case "returnToDraft":
        returnDraft.mutate({ actor }, { onSuccess: onSuccess("toast.returned") });
        break;
    }
  };

  const dialogCopy: Record<
    Exclude<PendingAction, null>,
    { title: string; body: string; confirm: string; danger: boolean }
  > = {
    submit: {
      title: t("detail.confirmSubmit.title"),
      body: t("detail.confirmSubmit.body", { title: document.title }),
      confirm: t("detail.actions.submit"),
      danger: false,
    },
    approve: {
      title: t("detail.confirmApprove.title"),
      body: t("detail.confirmApprove.body", { title: document.title }),
      confirm: t("detail.actions.approve"),
      danger: false,
    },
    reject: {
      title: t("detail.confirmReject.title"),
      body: t("detail.confirmReject.body", { title: document.title }),
      confirm: t("detail.actions.reject"),
      danger: true,
    },
    returnToDraft: {
      title: t("detail.confirmReturn.title"),
      body: t("detail.confirmReturn.body", { title: document.title }),
      confirm: t("detail.actions.returnToDraft"),
      danger: false,
    },
  };

  return (
    <article className="detail">
      <Link to="/documents" className="back-link">
        ← {t("common.back")}
      </Link>

      <div className="page-heading">
        <h1 className="detail__title">{document.title}</h1>
        <StatusBadge status={document.status} />
      </div>

      <div className="detail__actions">
        {actions.includes("edit") ? (
          <button
            type="button"
            className="button"
            onClick={() => navigate(`/documents/${document.id}/edit`)}
          >
            {t("detail.actions.edit")}
          </button>
        ) : null}
        {actions.includes("submit") ? (
          <button
            type="button"
            className="button button--primary"
            onClick={() => setPendingAction("submit")}
          >
            {t("detail.actions.submit")}
          </button>
        ) : null}
        {actions.includes("approve") ? (
          <button
            type="button"
            className="button button--primary"
            onClick={() => setPendingAction("approve")}
          >
            {t("detail.actions.approve")}
          </button>
        ) : null}
        {actions.includes("reject") ? (
          <button
            type="button"
            className="button button--danger"
            onClick={() => setPendingAction("reject")}
          >
            {t("detail.actions.reject")}
          </button>
        ) : null}
        {actions.includes("returnToDraft") ? (
          <button
            type="button"
            className="button"
            onClick={() => setPendingAction("returnToDraft")}
          >
            {t("detail.actions.returnToDraft")}
          </button>
        ) : null}
      </div>

      <dl className="detail__meta">
        <div>
          <dt>{t("detail.customer")}</dt>
          <dd>{document.customer}</dd>
        </div>
        <div>
          <dt>{t("detail.type")}</dt>
          <dd>{t(`docType.${document.documentType}`)}</dd>
        </div>
        <div>
          <dt>{t("detail.priority")}</dt>
          <dd>{t(`priority.${document.priority}`)}</dd>
        </div>
        <div>
          <dt>{t("detail.owner")}</dt>
          <dd>{document.owner.name}</dd>
        </div>
        <div>
          <dt>{t("detail.created")}</dt>
          <dd>{formatDateTime(document.createdDate, locale)}</dd>
        </div>
        <div>
          <dt>{t("detail.due")}</dt>
          <dd>{document.dueDate ? formatDate(document.dueDate, locale) : t("common.none")}</dd>
        </div>
        <div>
          <dt>{t("detail.approvers")}</dt>
          <dd>{document.approvers.map((a) => a.name).join(", ") || t("common.none")}</dd>
        </div>
      </dl>

      <ApprovalStepsSection document={document} />

      <section className="detail__section">
        <h2>{t("detail.description")}</h2>
        {document.description ? (
          <p>{document.description}</p>
        ) : (
          <p className="muted">{t("detail.noDescription")}</p>
        )}
      </section>

      <section className="detail__section">
        <h2>{t("detail.attachments")}</h2>
        <PdfAttachmentList attachments={document.attachments ?? []} />
      </section>

      <CommentsSection document={document} canComment={actions.includes("comment")} />

      <section className="detail__section">
        <h2>{t("detail.history")}</h2>
        <ol className="history">
          {[...document.approvalHistory]
            .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
            .map((entry) => (
              <li key={entry.id} className="history__entry">
                <p className="history__headline">
                  <strong>{t(`detail.historyAction.${entry.action}`)}</strong> · {entry.actor}
                </p>
                <p className="muted">{formatDateTime(entry.timestamp, locale)}</p>
                {entry.comment ? <p className="history__comment">{entry.comment}</p> : null}
              </li>
            ))}
        </ol>
      </section>

      {pendingAction ? (
        <ConfirmDialog
          open
          title={dialogCopy[pendingAction].title}
          body={dialogCopy[pendingAction].body}
          confirmLabel={dialogCopy[pendingAction].confirm}
          cancelLabel={t("common.cancel")}
          danger={dialogCopy[pendingAction].danger}
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
              <textarea
                value={actionComment}
                onChange={(e) => setActionComment(e.target.value)}
                rows={3}
              />
            </label>
          ) : null}
          {pendingAction === "reject" ? (
            <label className="dialog__field">
              {t("detail.confirmReject.reasonLabel")}
              <textarea
                value={actionComment}
                onChange={(e) => setActionComment(e.target.value)}
                rows={3}
                required
                aria-invalid={reasonError ? true : undefined}
              />
            </label>
          ) : null}
        </ConfirmDialog>
      ) : null}
    </article>
  );
}

/**
 * The ordered approval sequence for a submitted document. Approvals are
 * sequential, so the list makes explicit whose turn it is ("awaiting
 * decision"), who is queued behind them, and what each earlier approver
 * decided and when. Hidden for drafts, which have no steps yet.
 */
function ApprovalStepsSection({ document }: { document: ApprovalDocument }) {
  const { t, i18n } = useTranslation();

  if (document.approvalSteps.length === 0) return null;

  const currentIndex = document.approvalSteps.findIndex((step) => step.status === "pending");

  return (
    <section className="detail__section">
      <h2>{t("detail.steps.title")}</h2>
      <ol className="approval-steps">
        {document.approvalSteps.map((step, index) => {
          // A rejected document has no active turn: the remaining pending
          // steps are simply never reached in this round.
          const isCurrent = index === currentIndex && document.status === "pending_approval";
          const statusKey = isCurrent
            ? "current"
            : step.status === "pending"
              ? "waiting"
              : step.status;
          return (
            <li
              key={`${step.approver.id}-${index}`}
              className={`approval-steps__step${isCurrent ? " approval-steps__step--current" : ""}`}
              aria-current={isCurrent ? "step" : undefined}
            >
              <p className="approval-steps__headline">
                <strong>{step.approver.name}</strong> ·{" "}
                {t(`detail.steps.status.${statusKey}`)}
              </p>
              {step.decidedAt ? (
                <p className="muted">{formatDateTime(step.decidedAt, i18n.language)}</p>
              ) : null}
              {step.comment ? <p className="approval-steps__comment">{step.comment}</p> : null}
            </li>
          );
        })}
      </ol>
    </section>
  );
}

function CommentsSection({
  document,
  canComment,
}: {
  document: ApprovalDocument;
  canComment: boolean;
}) {
  const { t, i18n } = useTranslation();
  const { currentUser } = useCurrentUser();
  const { showToast } = useToast();
  const addComment = useAddComment(document.id);
  const [text, setText] = useState("");
  const canSubmit = text.trim().length > 0 && !addComment.isPending;

  const handleSubmit = (event: React.FormEvent) => {
    event.preventDefault();
    if (!canSubmit) return;
    addComment.mutate(
      { author: currentUser.name, text: text.trim() },
      {
        onSuccess: () => {
          setText("");
          showToast("success", t("toast.commentAdded"));
        },
      },
    );
  };

  return (
    <section className="detail__section">
      <h2>{t("detail.comments")}</h2>
      {document.comments.length === 0 ? (
        <p className="muted">{t("detail.noComments")}</p>
      ) : (
        <ul className="comment-list">
          {document.comments.map((comment) => (
            <li key={comment.id} className="comment">
              <p className="comment__meta">
                <strong>{comment.author}</strong> ·{" "}
                {formatDateTime(comment.createdAt, i18n.language)}
              </p>
              <p>{comment.text}</p>
            </li>
          ))}
        </ul>
      )}

      {canComment ? (
        <form className="comment-form" onSubmit={handleSubmit}>
          <label htmlFor="new-comment">{t("detail.commentLabel")}</label>
          <textarea
            id="new-comment"
            value={text}
            rows={3}
            placeholder={t("detail.commentPlaceholder")}
            onChange={(e) => setText(e.target.value)}
          />
          {addComment.isError ? (
            <p className="form-field__error" role="alert">
              {t("toast.actionFailed", { message: addComment.error.message })}
            </p>
          ) : null}
          <button
            type="submit"
            className="button"
            disabled={!canSubmit}
            aria-busy={addComment.isPending}
          >
            {t("detail.addComment")}
          </button>
        </form>
      ) : null}
    </section>
  );
}
