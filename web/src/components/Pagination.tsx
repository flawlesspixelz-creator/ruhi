import { useTranslation } from "react-i18next";

interface PaginationProps {
  page: number;
  totalPages: number;
  onPageChange: (page: number) => void;
}

export function Pagination({ page, totalPages, onPageChange }: PaginationProps) {
  const { t } = useTranslation();
  if (totalPages <= 1) return null;

  return (
    <nav className="pagination" aria-label={t("list.pageOf", { page, total: totalPages })}>
      <button
        type="button"
        className="button"
        disabled={page <= 1}
        onClick={() => onPageChange(page - 1)}
      >
        {t("list.prevPage")}
      </button>
      <span aria-current="page">{t("list.pageOf", { page, total: totalPages })}</span>
      <button
        type="button"
        className="button"
        disabled={page >= totalPages}
        onClick={() => onPageChange(page + 1)}
      >
        {t("list.nextPage")}
      </button>
    </nav>
  );
}
