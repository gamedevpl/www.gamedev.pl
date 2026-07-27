import { useTranslation } from 'react-i18next';
import { SUPPORTED_LANGUAGES } from './i18n/index.js';

const LABELS: Record<string, string> = { en: 'EN', pl: 'PL' };

export function LanguageSwitcher() {
  const { t, i18n } = useTranslation();
  const current = i18n.resolvedLanguage ?? i18n.language;

  return (
    <div className="language-switcher" role="group" aria-label={t('header.languageAria')}>
      {SUPPORTED_LANGUAGES.map((lang) => (
        <button
          key={lang}
          type="button"
          className={lang === current ? 'active' : ''}
          aria-pressed={lang === current}
          onClick={() => void i18n.changeLanguage(lang)}
        >
          {LABELS[lang]}
        </button>
      ))}
    </div>
  );
}
