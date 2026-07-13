import { useTranslation } from "react-i18next";
import { SUPPORTED_LANGUAGES } from "../i18n";

export function LanguageSelector() {
  const { t, i18n } = useTranslation();

  return (
    <label className="user-selector">
      <span className="visually-hidden">{t("app.language")}</span>
      <select
        value={i18n.language}
        onChange={(event) => i18n.changeLanguage(event.target.value)}
        aria-label={t("app.language")}
      >
        {SUPPORTED_LANGUAGES.map((language) => (
          <option key={language.code} value={language.code}>
            {language.label}
          </option>
        ))}
      </select>
    </label>
  );
}
