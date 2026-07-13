import i18n from "i18next";
import { initReactI18next } from "react-i18next";
import en from "./locales/en.json";
import fi from "./locales/fi.json";
import sv from "./locales/sv.json";

export const SUPPORTED_LANGUAGES = [
  { code: "en", label: "English" },
  { code: "fi", label: "Suomi" },
  { code: "sv", label: "Svenska" },
] as const;

const STORAGE_KEY = "dap.language";

function initialLanguage(): string {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored && SUPPORTED_LANGUAGES.some((l) => l.code === stored)) return stored;
  } catch {
    // localStorage unavailable (e.g. some private modes); fall through.
  }
  const nav = typeof navigator !== "undefined" ? navigator.language.slice(0, 2) : "en";
  return SUPPORTED_LANGUAGES.some((l) => l.code === nav) ? nav : "en";
}

i18n.use(initReactI18next).init({
  resources: {
    en: { translation: en },
    fi: { translation: fi },
    sv: { translation: sv },
  },
  lng: initialLanguage(),
  fallbackLng: "en",
  interpolation: { escapeValue: false },
});

i18n.on("languageChanged", (lng) => {
  try {
    localStorage.setItem(STORAGE_KEY, lng);
  } catch {
    // Best effort only.
  }
  document.documentElement.lang = lng;
});

document.documentElement.lang = i18n.language;

export default i18n;
