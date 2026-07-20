import { API_BASE_URL, ApiError, apiClient } from "./client";
import type { ApprovalDocument, Attachment, Comment } from "../types/document";

export function listDocuments(): Promise<ApprovalDocument[]> {
  return apiClient.get<ApprovalDocument[]>("/documents");
}

export function getDocument(id: string): Promise<ApprovalDocument> {
  return apiClient.get<ApprovalDocument>(`/documents/${id}`);
}

// approvalSteps is server-owned: the sequence is created on submit and never
// accepted from the client, so drafts don't carry it.
export type DocumentDraft = Omit<
  ApprovalDocument,
  "id" | "status" | "comments" | "approvalHistory" | "approvalSteps"
>;

/**
 * Upload a PDF with progress reporting. Uses XHR because fetch does not
 * expose upload progress events.
 */
export function uploadPdf(
  file: File,
  onProgress?: (fraction: number) => void,
): Promise<Attachment> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("POST", `${API_BASE_URL}/uploads`);
    xhr.responseType = "json";

    xhr.upload.addEventListener("progress", (event) => {
      if (event.lengthComputable && onProgress) {
        onProgress(event.loaded / event.total);
      }
    });

    xhr.addEventListener("load", () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        resolve(xhr.response as Attachment);
      } else {
        const message =
          (xhr.response as { error?: string } | null)?.error ??
          `Upload failed with status ${xhr.status}`;
        reject(new ApiError(message, xhr.status));
      }
    });
    xhr.addEventListener("error", () => reject(new ApiError("Network error during upload", 0)));
    xhr.addEventListener("abort", () => reject(new ApiError("Upload cancelled", 0)));

    const body = new FormData();
    body.append("file", file);
    xhr.send(body);
  });
}

/**
 * `actor` is the creating user's id. The server resolves the document's
 * owner from it and ignores any client-supplied `owner`.
 */
export function createDocument(draft: DocumentDraft, actor: string): Promise<ApprovalDocument> {
  return apiClient.post<ApprovalDocument>("/documents", {
    ...draft,
    actor,
    status: "draft",
    comments: [],
    approvalHistory: [],
  });
}

export function updateDocument(
  id: string,
  draft: Partial<DocumentDraft>,
): Promise<ApprovalDocument> {
  return apiClient.put<ApprovalDocument>(`/documents/${id}`, draft);
}

export function submitDocument(id: string, actor: string): Promise<ApprovalDocument> {
  return apiClient.post<ApprovalDocument>(`/documents/${id}/submit`, { actor });
}

export function approveDocument(
  id: string,
  actor: string,
  comment?: string,
): Promise<ApprovalDocument> {
  return apiClient.post<ApprovalDocument>(`/documents/${id}/approve`, { actor, comment });
}

export function rejectDocument(
  id: string,
  actor: string,
  reason: string,
): Promise<ApprovalDocument> {
  return apiClient.post<ApprovalDocument>(`/documents/${id}/reject`, { actor, reason });
}

export function returnToDraft(id: string, actor: string): Promise<ApprovalDocument> {
  return apiClient.post<ApprovalDocument>(`/documents/${id}/return-to-draft`, { actor });
}

export function addComment(
  id: string,
  author: string,
  text: string,
): Promise<Comment> {
  return apiClient.post<Comment>(`/documents/${id}/comments`, { author, text });
}
