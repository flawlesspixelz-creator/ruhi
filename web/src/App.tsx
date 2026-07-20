import { Link, Outlet } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { UserSelector } from "./components/UserSelector";
import { LanguageSelector } from "./components/LanguageSelector";
import "./App.css";

/** Application chrome: header with simulated auth + language, page outlet. */
function App() {
  const { t } = useTranslation();

  return (
    <>
      <a className="skip-link" href="#main-content">
        {t("app.skipToContent")}
      </a>
      <header className="app-header">
        <div className="app-header__content">
          {/* aria-label: the full title span is display:none on small
              screens (removing it from the accessible name) and the short
              one is aria-hidden, so without this the link has no name. */}
          <Link to="/documents" className="app-title" aria-label={t("app.title")}>
            <span className="app-title__full">{t("app.title")}</span>
            <span className="app-title__short" aria-hidden="true">
              {t("app.titleShort")}
            </span>
          </Link>
          <div className="app-header__controls">
            <UserSelector />
            <LanguageSelector />
          </div>
        </div>
      </header>

      <main id="main-content" className="app-main">
        <Outlet />
      </main>
    </>
  );
}

export default App;
