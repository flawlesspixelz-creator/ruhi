import { useCallback, useMemo } from "react";
import { useSearchParams } from "react-router-dom";
import {
  parseListState,
  serializeListState,
  type DocumentListState,
} from "../domain/listState";

/**
 * The URL is the single source of truth for the document list state, so a
 * filtered view can be refreshed, shared, and navigated with back/forward.
 *
 * Any change other than the page number resets pagination, so the user is
 * never stranded on an out-of-range page after narrowing a filter.
 */
export function useUrlListState() {
  const [searchParams, setSearchParams] = useSearchParams();

  const state = useMemo(() => parseListState(searchParams), [searchParams]);

  const update = useCallback(
    (patch: Partial<DocumentListState>) => {
      setSearchParams(
        (previous) => {
          const current = parseListState(previous);
          const next = { ...current, ...patch };
          if (!("page" in patch)) next.page = 1;
          return serializeListState(next);
        },
        { replace: true },
      );
    },
    [setSearchParams],
  );

  const reset = useCallback(() => {
    setSearchParams(new URLSearchParams(), { replace: true });
  }, [setSearchParams]);

  return { state, update, reset };
}
