import { apiClient } from "./client";
import type { ApprovalDocument, Attachment, Comment } from "../types/document";

export function listDocuments(): Promise<ApprovalDocument[]> {
  return apiClient.get<ApprovalDocument[]>("/documents");
}

export function getDocument(id: string): Promise<ApprovalDocument> {
  return apiClient.get<ApprovalDocument>(`/documents/${id}`);
}

export type DocumentDraft = Omit<
  ApprovalDocument,
  "id" | "status" | "comments" | "approvalHistory"
>;

export function uploadPdf(file: File): Promise<Attachment> {
  const body = new FormData();
  body.append("file", file);
  return apiClient.postForm<Attachment>("/uploads", body);
}

export function createDocument(draft: DocumentDraft): Promise<ApprovalDocument> {
  return apiClient.post<ApprovalDocument>("/documents", {
    ...draft,
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
