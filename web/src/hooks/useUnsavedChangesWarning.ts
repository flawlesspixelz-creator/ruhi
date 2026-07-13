import { useEffect, type RefObject } from "react";
import { useBlocker } from "react-router-dom";

/**
 * Warn before losing unsaved form changes, both for in-app navigation
 * (via the router blocker, surfaced as an in-app dialog) and for tab
 * close / reload (via beforeunload, browser-native prompt).
 *
 * Takes a ref rather than a boolean so callers can clear the flag
 * synchronously (e.g. right after a successful save, before navigating)
 * without racing a re-render.
 */
export function useUnsavedChangesWarning(isDirtyRef: RefObject<boolean>) {
  const blocker = useBlocker(
    ({ currentLocation, nextLocation }) =>
      isDirtyRef.current && currentLocation.pathname !== nextLocation.pathname,
  );

  useEffect(() => {
    const handler = (event: BeforeUnloadEvent) => {
      if (isDirtyRef.current) event.preventDefault();
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [isDirtyRef]);

  return blocker;
}
