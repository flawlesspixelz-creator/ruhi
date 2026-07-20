import { useLayoutEffect, useRef, useState } from "react";

const MOBILE_BREAKPOINT_PX = 720;
const MIN_ROWS = 3;
// Approximate room needed below the last row for the pagination control and
// its margin; the fit doesn't need to be pixel-perfect, just avoid leaving
// an obviously empty gap or forcing a scrollbar.
const FOOTER_RESERVE_PX = 90;

/**
 * Computes how many table rows fit in the remaining viewport height below
 * the table, so a page shows as many rows as fit — and the pagination
 * footer lands right after the last row — instead of a fixed page size that
 * can leave a large empty gap on tall screens (or force scrolling on short
 * ones).
 *
 * Falls back to `fallback` on narrow viewports, where rows become taller
 * stacked cards (see the responsive table styles) and a fixed page size
 * reads better than a recomputed one.
 */
export function useDynamicPageSize(fallback: number) {
  const tableRef = useRef<HTMLTableElement>(null);
  const [pageSize, setPageSize] = useState(fallback);

  useLayoutEffect(() => {
    const recompute = () => {
      const table = tableRef.current;
      if (!table || window.innerWidth < MOBILE_BREAKPOINT_PX) {
        setPageSize(fallback);
        return;
      }

      const firstRow = table.tBodies[0]?.rows[0];
      const rowHeight = firstRow?.getBoundingClientRect().height;
      if (!rowHeight) return;

      const headHeight = table.tHead?.getBoundingClientRect().height ?? 0;
      const available =
        window.innerHeight - table.getBoundingClientRect().top - headHeight - FOOTER_RESERVE_PX;
      const rows = Math.floor(available / rowHeight);
      setPageSize(Math.max(MIN_ROWS, rows));
    };

    recompute();
    window.addEventListener("resize", recompute);
    return () => window.removeEventListener("resize", recompute);
  }, [fallback]);

  return { tableRef, pageSize };
}
