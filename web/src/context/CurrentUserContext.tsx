import { createContext, useContext, useState, type ReactNode } from "react";
import type { CurrentUser } from "../types/user";

// Simulated auth: no real login, just a user selector. See README "Simulated
// auth" section. Swap the seed users for whatever mock-api/db.json contains.
export const MOCK_USERS: CurrentUser[] = [
  { id: "u1", name: "Alice Johnson", role: "creator" },
  { id: "u2", name: "Bob Martinez", role: "approver" },
  { id: "u3", name: "Chen Wei", role: "approver" },
  { id: "u4", name: "Dana Patel", role: "read-only" },
];

interface CurrentUserContextValue {
  currentUser: CurrentUser;
  setCurrentUser: (user: CurrentUser) => void;
}

const CurrentUserContext = createContext<CurrentUserContextValue | null>(null);

export function CurrentUserProvider({ children }: { children: ReactNode }) {
  const [currentUser, setCurrentUser] = useState<CurrentUser>(MOCK_USERS[0]);

  return (
    <CurrentUserContext.Provider value={{ currentUser, setCurrentUser }}>
      {children}
    </CurrentUserContext.Provider>
  );
}

export function useCurrentUser() {
  const ctx = useContext(CurrentUserContext);
  if (!ctx) throw new Error("useCurrentUser must be used within CurrentUserProvider");
  return ctx;
}
