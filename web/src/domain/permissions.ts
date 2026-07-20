import type { ApprovalDocument } from "../types/document";
import type { CurrentUser } from "../types/user";

/**
 * Workflow actions a user may be offered on a document.
 * "edit" covers both the edit page link and resubmission after returning
 * a rejected document to draft.
 */
export type DocumentAction =
  | "edit"
  | "submit"
  | "approve"
  | "reject"
  | "returnToDraft"
  | "comment";

export type PermissionSubject = Pick<ApprovalDocument, "status" | "approvers" | "owner">;

export function isAssignedApprover(doc: PermissionSubject, user: CurrentUser): boolean {
  return doc.approvers.some((approver) => approver.id === user.id);
}

/** Creators and approvers may originate documents; read-only users never mutate. */
export function canCreateDocument(user: CurrentUser): boolean {
  return user.role !== "read-only";
}

/**
 * A document's owner may never also be one of its approvers — that would let
 * them review their own work, the same conflict `getAvailableActions` blocks
 * once a document is pending. Enforced here too so the form never offers the
 * pairing in the first place.
 */
export function isEligibleApprover(user: CurrentUser, ownerId: string): boolean {
  return user.role === "approver" && user.id !== ownerId;
}

/**
 * Single source of truth for the status x role action matrix.
 *
 * Rules (see DESIGN.md for the reasoning):
 * - Read-only users are never offered mutating actions, including comments.
 * - Draft:            edit + submit for creators and approvers.
 * - Pending approval: approve + reject only for users with the approver role
 *                     who are also assigned as approvers on the document.
 *                     An assigned approver who also owns the document gets
 *                     neither action (no self-review): they can only add
 *                     comments and wait for another approver to act.
 * - Approved:         terminal; view only (comments still allowed).
 * - Rejected:         edit (fix the fields in place) and return to draft;
 *                     resubmission = return to draft + submit, because the
 *                     API only accepts submit from the draft status.
 */
export function getAvailableActions(
  doc: PermissionSubject,
  user: CurrentUser,
): DocumentAction[] {
  if (user.role === "read-only") return [];

  const actions: DocumentAction[] = ["comment"];

  switch (doc.status) {
    case "draft":
      actions.push("edit", "submit");
      break;
    case "pending_approval":
      if (
        user.role === "approver" &&
        isAssignedApprover(doc, user) &&
        doc.owner.id !== user.id
      ) {
        actions.push("approve", "reject");
      }
      break;
    case "rejected":
      actions.push("edit", "returnToDraft");
      break;
    case "approved":
      break;
  }

  return actions;
}

export function canPerform(
  action: DocumentAction,
  doc: PermissionSubject,
  user: CurrentUser,
): boolean {
  return getAvailableActions(doc, user).includes(action);
}
