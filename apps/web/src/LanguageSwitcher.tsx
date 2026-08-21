import type { Locale } from '@gamedevpl/contract';
import { useTranslation } from 'react-i18next';
import { SUPPORTED_LANGUAGES } from './i18n/index.js';

const LABELS: Record<string, string> = { en: 'EN', pl: 'PL' };

function resolveLang(language: string | undefined): Locale {
  return language?.toLowerCase().startsWith('pl') ? 'pl' : 'en';
}

/** EN | PL with the active locale pressed — a lone code was ambiguous. */
export function LanguageSwitcher() {
  const { t, i18n } = useTranslation();
  const current = resolveLang(i18n.resolvedLanguage ?? i18n.language);

  return (
    <div className="language-switcher" role="group" aria-label={t('header.languageAria')}>
      {SUPPORTED_LANGUAGES.map((lang) => (
        <button
          key={lang}
          type="button"
          className={lang === current ? 'active' : ''}
          aria-pressed={lang === current}
          aria-label={t(lang === 'en' ? 'header.languageEn' : 'header.languagePl')}
          onClick={() => void i18n.changeLanguage(lang)}
        >
          {LABELS[lang]}
        </button>
      ))}
    </div>
  );
}
