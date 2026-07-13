import { Link, Navigate, Route, Routes } from "react-router-dom";
import { UserSelector } from "./components/UserSelector";
import { DocumentListPage } from "./pages/DocumentListPage";
import { DocumentDetailPage } from "./pages/DocumentDetailPage";
import { DocumentFormPage } from "./pages/DocumentFormPage";
import { NotFoundPage } from "./pages/NotFoundPage";
import "./App.css";

function App() {
  return (
    <>
      <header className="app-header">
        <div className="app-header__content">
          <Link to="/documents" className="app-title">
            <span className="app-title__full">Document Approval Portal</span>
            <span className="app-title__short" aria-hidden="true">
              Documents
            </span>
          </Link>
          <UserSelector />
        </div>
      </header>

      <main className="app-main">
        <Routes>
          <Route path="/" element={<Navigate to="/documents" replace />} />
          <Route path="/documents" element={<DocumentListPage />} />
          <Route path="/documents/new" element={<DocumentFormPage />} />
          <Route path="/documents/:id" element={<DocumentDetailPage />} />
          <Route path="/documents/:id/edit" element={<DocumentFormPage />} />
          <Route path="*" element={<NotFoundPage />} />
        </Routes>
      </main>
    </>
  );
}

export default App;
