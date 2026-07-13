import { useParams } from "react-router-dom";

export function DocumentDetailPage() {
  const { id } = useParams<{ id: string }>();

  return (
    <div>
      <h1>Document {id}</h1>
      <p>TODO: build the document detail view here.</p>
    </div>
  );
}
