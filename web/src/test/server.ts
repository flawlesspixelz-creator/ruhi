import { setupServer } from "msw/node";
import { HttpResponse, http } from "msw";
import { API_BASE_URL } from "../api/client";
import type { ApprovalDocument } from "../types/document";
import { ALL_USERS } from "./fixtures";

export const server = setupServer();

export function api(path: string): string {
  return `${API_BASE_URL}${path}`;
}

/** Standard read handlers over an in-memory document set. */
export function seedReadHandlers(documents: ApprovalDocument[]) {
  server.use(
    http.get(api("/users"), () => HttpResponse.json(ALL_USERS)),
    http.get(api("/documents"), () => HttpResponse.json(documents)),
    http.get(api("/documents/:id"), ({ params }) => {
      const found = documents.find((doc) => doc.id === params.id);
      return found
        ? HttpResponse.json(found)
        : HttpResponse.json({ error: "Document not found" }, { status: 404 });
    }),
  );
}
