import { useState } from "react";
import { useTranslation } from "react-i18next";
import type { Attachment } from "../types/document";
import { formatFileSize } from "../utils/format";

/**
 * Attachments with an in-app PDF preview. Rendering uses the browser's
 * built-in PDF viewer in an <iframe>; a persistent "open in a new tab" link
 * doubles as the fallback when inline rendering is unavailable.
 *
 * Attachments whose MIME type is not application/pdf are treated as invalid
 * data: named, but never rendered.
 */
export function PdfAttachmentList({ attachments }: { attachments: Attachment[] }) {
  const { t } = useTranslation();

  if (attachments.length === 0) {
    return <p className="muted">{t("detail.noAttachments")}</p>;
  }

  return (
    <ul className="attachment-list">
      {attachments.map((attachment) => (
        <AttachmentItem key={attachment.id} attachment={attachment} />
      ))}
    </ul>
  );
}

function AttachmentItem({ attachment }: { attachment: Attachment }) {
  const { t, i18n } = useTranslation();
  const [previewOpen, setPreviewOpen] = useState(false);
  const [loadFailed, setLoadFailed] = useState(false);

  const isPdf = attachment.contentType === "application/pdf";
  const size = formatFileSize(attachment.size, i18n.language);

  return (
    <li className="attachment">
      <div className="attachment__row">
        <span className="attachment__name">
          {attachment.name}
          {size ? <span className="muted"> · {size}</span> : null}
        </span>
        {isPdf ? (
          <span className="attachment__actions">
            <button
              type="button"
              className="button button--small"
              aria-expanded={previewOpen}
              onClick={() => setPreviewOpen((open) => !open)}
            >
              {previewOpen ? t("detail.hidePdf") : t("detail.viewPdf")}
            </button>
            <a
              className="button button--small"
              href={attachment.url}
              target="_blank"
              rel="noreferrer"
            >
              {t("detail.openInNewTab")}
            </a>
          </span>
        ) : null}
      </div>

      {!isPdf ? <p className="form-field__error">{t("detail.invalidAttachment")}</p> : null}

      {isPdf && previewOpen ? (
        loadFailed ? (
          <p className="feedback feedback--error" role="alert">
            {t("detail.pdfError")}{" "}
            <a href={attachment.url} target="_blank" rel="noreferrer">
              {t("detail.openInNewTab")}
            </a>
          </p>
        ) : (
          <iframe
            className="attachment__preview"
            src={attachment.url}
            title={t("detail.pdfFrameTitle", { name: attachment.name })}
            onError={() => setLoadFailed(true)}
          />
        )
      ) : null}
    </li>
  );
}
