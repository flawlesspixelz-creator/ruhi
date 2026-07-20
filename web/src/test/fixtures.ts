import type { ApprovalDocument, ApprovalStep, UserRef } from "../types/document";
import type { CurrentUser } from "../types/user";

export const CREATOR: CurrentUser = { id: "u1", name: "Alice Johnson", role: "creator" };
export const APPROVER: CurrentUser = { id: "u2", name: "Bob Martinez", role: "approver" };
export const OTHER_APPROVER: CurrentUser = { id: "u3", name: "Chen Wei", role: "approver" };
export const READ_ONLY: CurrentUser = { id: "u4", name: "Dana Patel", role: "read-only" };

export const ALL_USERS = [CREATOR, APPROVER, OTHER_APPROVER, READ_ONLY];

let seq = 0;

export function makeDocument(
  overrides: Partial<ApprovalDocument> = {},
): ApprovalDocument {
  seq += 1;
  return {
    id: `doc-${seq}`,
    title: `Test document ${seq}`,
    documentType: "Contract",
    customer: "Acme Corp",
    createdDate: "2026-06-01T09:00:00.000Z",
    dueDate: null,
    owner: { id: CREATOR.id, name: CREATOR.name },
    status: "draft",
    priority: "Medium",
    approvers: [{ id: APPROVER.id, name: APPROVER.name }],
    approvalSteps: [],
    comments: [],
    attachments: [],
    approvalHistory: [
      {
        id: `h-${seq}`,
        action: "created",
        actor: CREATOR.name,
        comment: null,
        timestamp: "2026-06-01T09:00:00.000Z",
      },
    ],
    ...overrides,
  };
}

/**
 * Builds an ordered approval sequence the way the server does on submit:
 * every listed user gets a pending step, in order. Decide earlier steps with
 * `decide` overrides keyed by user id.
 */
export function makeSteps(
  users: CurrentUser[] | UserRef[],
  decide: Record<string, Pick<ApprovalStep, "status" | "decidedAt" | "comment">> = {},
): ApprovalStep[] {
  return users.map((user) => {
    const pending: ApprovalStep = {
      approver: { id: user.id, name: user.name },
      status: "pending",
      decidedAt: null,
      comment: null,
    };
    return { ...pending, ...decide[user.id] };
  });
}
