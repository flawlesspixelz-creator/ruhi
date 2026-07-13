export type DocumentStatus = "draft" | "pending_approval" | "approved" | "rejected";

export type DocumentType = "Contract" | "Invoice" | "Proposal" | "Report" | "Policy" | "Other";

export type Priority = "Low" | "Medium" | "High";

export interface UserRef {
  id: string;
  name: string;
}

export interface Comment {
  id: string;
  author: string;
  text: string;
  createdAt: string;
}

export interface Attachment {
  id: string;
  name: string;
  contentType: "application/pdf";
  size: number;
  url: string;
}

export interface ApprovalHistoryEntry {
  id: string;
  action: "created" | "submitted" | "approved" | "rejected" | "returned_to_draft";
  actor: string;
  comment: string | null;
  timestamp: string;
}

// NOTE: some seed records omit optional fields (description, attachments) to
// simulate older documents created before those fields existed. Don't assume
// they're always present.
export interface ApprovalDocument {
  id: string;
  title: string;
  documentType: DocumentType;
  customer: string;
  createdDate: string;
  dueDate: string | null;
  owner: UserRef;
  status: DocumentStatus;
  priority: Priority;
  description?: string;
  approvers: UserRef[];
  comments: Comment[];
  attachments?: Attachment[];
  approvalHistory: ApprovalHistoryEntry[];
}
