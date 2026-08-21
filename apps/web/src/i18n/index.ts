import { LOCALES, type Locale } from '@gamedevpl/contract';
import i18n from 'i18next';
import LanguageDetector from 'i18next-browser-languagedetector';
import { initReactI18next } from 'react-i18next';
import en from './locales/en.json';
import pl from './locales/pl.json';

export const SUPPORTED_LANGUAGES = LOCALES;
export type SupportedLanguage = Locale;

void i18n
  .use(LanguageDetector)
  .use(initReactI18next)
  .init({
    resources: { en: { translation: en }, pl: { translation: pl } },
    fallbackLng: 'en',
    supportedLngs: SUPPORTED_LANGUAGES,
    // Only the language subtag matters (e.g. 'pl-PL' -> 'pl'); avoids missing
    // resources for locale variants we don't ship separately.
    load: 'languageOnly',
    interpolation: { escapeValue: false },
    detection: {
      order: ['localStorage', 'navigator'],
      caches: ['localStorage'],
      lookupLocalStorage: 'gamedevpl:lang',
    },
  });

export default i18n;
