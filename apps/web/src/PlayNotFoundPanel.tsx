import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';

export function PlayNotFoundPanel({
  isNotFound,
  error,
  onExit,
}: {
  isNotFound: boolean;
  error: ReactNode;
  onExit: () => void;
}) {
  const { t } = useTranslation();

  return (
    <section className="panel status-panel">
      <h2 className="section-title">{isNotFound ? t('draft.title') : t('draft.errorTitle')}</h2>
      <p className="error">{error}</p>
      <a
        className="inline-link"
        href="/"
        onClick={(event) => {
          if (event.defaultPrevented || event.button !== 0) return;
          if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
          event.preventDefault();
          onExit();
        }}
      >
        {t('statusView.backHome')}
      </a>
    </section>
  );
}
