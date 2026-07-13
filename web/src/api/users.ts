import { apiClient } from "./client";
import type { CurrentUser } from "../types/user";

export function listUsers(): Promise<CurrentUser[]> {
  return apiClient.get<CurrentUser[]>("/users");
}
