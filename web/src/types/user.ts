export type UserRole = "creator" | "approver" | "read-only";

export interface CurrentUser {
  id: string;
  name: string;
  role: UserRole;
}
