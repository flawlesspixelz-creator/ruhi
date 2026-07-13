import { useTranslation } from "react-i18next";
import { MOCK_USERS, useCurrentUser } from "../context/CurrentUserContext";
import { useUsersQuery } from "../hooks/useDocuments";

/**
 * Simulated authentication: switching user is switching identity.
 * Users come from GET /users, with the static seed as fallback so the
 * header stays usable while loading or when the API is down.
 */
export function UserSelector() {
  const { t } = useTranslation();
  const { currentUser, setCurrentUser } = useCurrentUser();
  const { data } = useUsersQuery();
  const users = data ?? MOCK_USERS;

  return (
    <label className="user-selector">
      {t("app.currentUser")}
      <select
        value={currentUser.id}
        onChange={(e) => {
          const next = users.find((u) => u.id === e.target.value);
          if (next) setCurrentUser(next);
        }}
      >
        {users.map((user) => (
          <option key={user.id} value={user.id}>
            {user.name} ({user.role})
          </option>
        ))}
      </select>
    </label>
  );
}
