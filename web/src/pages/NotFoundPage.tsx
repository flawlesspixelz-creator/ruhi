import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";

export function NotFoundPage() {
  const { t } = useTranslation();
  return (
    <div>
      <h1>{t("notFound.title")}</h1>
      <Link to="/documents">{t("common.back")}</Link>
    </div>
  );
}
