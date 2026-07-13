import { MOCK_USERS, useCurrentUser } from "../context/CurrentUserContext";

export function UserSelector() {
  const { currentUser, setCurrentUser } = useCurrentUser();

  return (
    <label className="user-selector">
      Current user:
      <select
        value={currentUser.id}
        onChange={(e) => {
          const next = MOCK_USERS.find((u) => u.id === e.target.value);
          if (next) setCurrentUser(next);
        }}
      >
        {MOCK_USERS.map((user) => (
          <option key={user.id} value={user.id}>
            {user.name} ({user.role})
          </option>
        ))}
      </select>
    </label>
  );
}
