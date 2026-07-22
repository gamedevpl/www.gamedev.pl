import { useTranslation } from 'react-i18next';
import { type CatalogEntry } from './catalog';

type ArcadeCatalogProps = {
  catalogStatus: 'loading' | 'ready' | 'error';
  catalogError: string | null;
  catalogEntries: CatalogEntry[];
  onPlayGame: (game: CatalogEntry) => void;
  onRemixGame: (game: CatalogEntry) => void;
};

export function ArcadeCatalog({
  catalogStatus,
  catalogError,
  catalogEntries,
  onPlayGame,
  onRemixGame,
}: ArcadeCatalogProps) {
  const { t } = useTranslation();

  return (
    <section id="arcade" className="panel catalog-panel">
      <div className="section-header">
        <h2 className="section-title">🕹️ {t('catalog.title')}</h2>
        <p className="panel-copy">{t('catalog.subtitle')}</p>
      </div>

      {catalogStatus === 'loading' ? (
        <p className="catalog-state">{t('catalog.loading')}</p>
      ) : catalogStatus === 'error' ? (
        <p className="error">{t('catalog.error', { message: catalogError ?? t('errors.generic') })}</p>
      ) : catalogEntries.length === 0 ? (
        <p className="catalog-state">{t('catalog.empty')}</p>
      ) : (
        <div className="catalog-grid">
          {catalogEntries.map((entry) => (
            <article key={entry.slug} className="catalog-card">
              <div className="card-header">
                <h3>{entry.title}</h3>
                <span className="genre-pill">{entry.genre}</span>
              </div>

              <dl className="catalog-meta">
                <div>
                  <dt>{t('catalog.controls')}</dt>
                  <dd>{entry.controls}</dd>
                </div>
              </dl>

              <div className="card-actions">
                <button className="primary-btn" onClick={() => onPlayGame(entry)}>
                  ▶ {t('catalog.play')}
                </button>
                <button className="secondary-btn" onClick={() => onRemixGame(entry)}>
                  ⚡ {t('catalog.remix')}
                </button>
              </div>
            </article>
          ))}
        </div>
      )}
    </section>
  );
}
