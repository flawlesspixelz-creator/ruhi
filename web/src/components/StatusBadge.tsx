import { useTranslation } from "react-i18next";
import type { DocumentStatus } from "../types/document";

export function StatusBadge({ status }: { status: DocumentStatus }) {
  const { t } = useTranslation();
  return (
    <span className={`status-badge status-badge--${status}`}>
      {t(`status.${status}`)}
    </span>
  );
}
