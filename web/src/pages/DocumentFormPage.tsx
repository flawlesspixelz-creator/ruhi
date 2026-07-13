import { useParams } from "react-router-dom";

export function DocumentFormPage() {
  const { id } = useParams<{ id: string }>();
  const isEditing = Boolean(id);

  return (
    <div>
      <h1>{isEditing ? `Edit document ${id}` : "New document"}</h1>
      <p>TODO: build the create/edit form here.</p>
    </div>
  );
}
