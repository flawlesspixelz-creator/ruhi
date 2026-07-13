import { createBrowserRouter, Navigate, type RouteObject } from "react-router-dom";
import App from "./App";
import { DocumentListPage } from "./pages/DocumentListPage";
import { DocumentDetailPage } from "./pages/DocumentDetailPage";
import { DocumentFormPage } from "./pages/DocumentFormPage";
import { NotFoundPage } from "./pages/NotFoundPage";

/**
 * Route table, exported separately so tests can mount the exact same routes
 * in a memory router. A data router (createBrowserRouter) is required for
 * useBlocker, which powers the unsaved-changes warning.
 */
export const routes: RouteObject[] = [
  {
    element: <App />,
    children: [
      { path: "/", element: <Navigate to="/documents" replace /> },
      { path: "/documents", element: <DocumentListPage /> },
      { path: "/documents/new", element: <DocumentFormPage /> },
      { path: "/documents/:id", element: <DocumentDetailPage /> },
      { path: "/documents/:id/edit", element: <DocumentFormPage /> },
      { path: "*", element: <NotFoundPage /> },
    ],
  },
];

export const router = createBrowserRouter(routes);
