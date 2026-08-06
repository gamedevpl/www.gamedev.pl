import { useTranslation } from 'react-i18next';

const LABELS: Record<string, string> = { en: 'EN', pl: 'PL' };

function resolveLang(language: string | undefined): 'en' | 'pl' {
  return language?.toLowerCase().startsWith('pl') ? 'pl' : 'en';
}

/**
 * One control that flips between the two shipped languages. Showing the language
 * you would switch *to* makes the action obvious without a two-button segmented
 * control eating header space.
 */
export function LanguageSwitcher() {
  const { t, i18n } = useTranslation();
  const current = resolveLang(i18n.resolvedLanguage ?? i18n.language);
  const next = current === 'en' ? 'pl' : 'en';

  return (
    <button
      type="button"
      className="language-switcher"
      aria-label={t('header.languageAria')}
      title={LABELS[next]}
      onClick={() => void i18n.changeLanguage(next)}
    >
      {LABELS[next]}
    </button>
  );
}
