import { Link } from "react-router-dom";

export function NotFoundPage() {
  return (
    <div>
      <h1>Page not found</h1>
      <Link to="/documents">Back to documents</Link>
    </div>
  );
}
