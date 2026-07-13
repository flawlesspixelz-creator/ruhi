import { render } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createMemoryRouter, RouterProvider } from "react-router-dom";
import "../i18n";
import { routes } from "../router";
import { CurrentUserProvider } from "../context/CurrentUserContext";
import { ToastProvider } from "../components/Toast";
import type { CurrentUser } from "../types/user";
import { CREATOR } from "./fixtures";

/**
 * Mount the real route table in a memory router with fresh providers, so
 * integration tests exercise the same wiring as the app (permissions,
 * URL state, query cache, toasts).
 */
export function renderApp({
  path = "/documents",
  user = CREATOR,
}: {
  path?: string;
  user?: CurrentUser;
} = {}) {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  });
  const router = createMemoryRouter(routes, { initialEntries: [path] });

  const view = render(
    <QueryClientProvider client={queryClient}>
      <CurrentUserProvider initialUser={user}>
        <ToastProvider>
          <RouterProvider router={router} />
        </ToastProvider>
      </CurrentUserProvider>
    </QueryClientProvider>,
  );

  return { ...view, router, queryClient };
}
