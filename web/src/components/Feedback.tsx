import { useTranslation } from "react-i18next";
import type { ReactNode } from "react";

export function LoadingState({ label }: { label?: string }) {
  const { t } = useTranslation();
  return (
    <div className="feedback" role="status">
      <span className="spinner" aria-hidden="true" />
      {label ?? t("common.loading")}
    </div>
  );
}

export function ErrorState({
  title,
  message,
  onRetry,
}: {
  title?: string;
  message?: string;
  onRetry?: () => void;
}) {
  const { t } = useTranslation();
  return (
    <div className="feedback feedback--error" role="alert">
      <p className="feedback__title">{title ?? t("common.errorTitle")}</p>
      {message ? <p>{message}</p> : null}
      {onRetry ? (
        <button type="button" className="button" onClick={onRetry}>
          {t("common.retry")}
        </button>
      ) : null}
    </div>
  );
}

export function EmptyState({ title, body }: { title: string; body?: ReactNode }) {
  return (
    <div className="feedback">
      <p className="feedback__title">{title}</p>
      {body ? <p>{body}</p> : null}
    </div>
  );
}
