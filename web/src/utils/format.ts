/** Locale-aware date helpers shared by the list, detail, and history views. */

export function formatDate(iso: string | null | undefined, locale: string): string {
  if (!iso) return "";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  return new Intl.DateTimeFormat(locale, { dateStyle: "medium" }).format(date);
}

export function formatDateTime(iso: string | null | undefined, locale: string): string {
  if (!iso) return "";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  return new Intl.DateTimeFormat(locale, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
}

/**
 * `<input type="date">` reports its value as "yyyy-mm-dd" but keyboard entry
 * can still produce non-existent calendar dates (e.g. 2026-02-30) that the
 * browser doesn't reject. Round-trip through Date.UTC to confirm it's real.
 */
export function isValidDateInputValue(value: string): boolean {
  if (!value) return true;
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return false;
  const [, yearStr, monthStr, dayStr] = match;
  const year = Number(yearStr);
  const month = Number(monthStr);
  const day = Number(dayStr);
  const date = new Date(Date.UTC(year, month - 1, day));
  return (
    date.getUTCFullYear() === year &&
    date.getUTCMonth() === month - 1 &&
    date.getUTCDate() === day
  );
}

export function formatFileSize(bytes: number, locale: string): string {
  if (!Number.isFinite(bytes) || bytes < 0) return "";
  if (bytes < 1024) return `${bytes} B`;
  const kb = bytes / 1024;
  const formatter = new Intl.NumberFormat(locale, { maximumFractionDigits: 1 });
  if (kb < 1024) return `${formatter.format(kb)} kB`;
  return `${formatter.format(kb / 1024)} MB`;
}
