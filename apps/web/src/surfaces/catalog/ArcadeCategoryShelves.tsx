import { useTranslation } from 'react-i18next';
import { type CatalogEntry } from '../../catalog.js';
import { type CatalogCategoryId } from './catalogCategory.js';
import { CatalogRail } from './CatalogRail.js';
import { type CatalogShelf } from './useCatalogBrowsing.js';
import type { PlayVia } from '../../visitTelemetry.js';

// Jumpbar and one rail per category, below the fixed rails.
export function ArcadeCategoryShelves({
  shelfCategories,
  onJumpToAll,
  onScrollToShelf,
  onSeeAll,
  onPlayGame,
  onPlayTogether,
}: {
  shelfCategories: CatalogShelf[];
  onJumpToAll: () => void;
  onScrollToShelf: (id: CatalogCategoryId) => void;
  onSeeAll: (id: CatalogCategoryId) => void;
  onPlayGame: (game: CatalogEntry, via?: PlayVia) => void;
  onPlayTogether: (game: CatalogEntry, via?: PlayVia) => void;
}) {
  const { t } = useTranslation();

  return (
    <>
      <nav className="catalog-jumpbar" aria-label={t('catalog.jumpBarLabel')}>
        <button type="button" className="jump-chip is-all" onClick={onJumpToAll}>
          {t('catalog.jumpAll')}
        </button>
        {shelfCategories.map((shelf) => (
          <button key={shelf.id} type="button" className="jump-chip" onClick={() => onScrollToShelf(shelf.id)}>
            <span className={`jump-chip-dot cat-${shelf.id}`} aria-hidden="true" />
            {t(`catalog.categories.${shelf.id}`)}
          </button>
        ))}
      </nav>
      {shelfCategories.map((shelf) => (
        <div id={`shelf-${shelf.id}`} key={shelf.id} className={`catalog-shelf cat-${shelf.id}`}>
          <CatalogRail
            heading={t(`catalog.categories.${shelf.id}`)}
            entries={shelf.entries}
            via="shelf"
            onPlayGame={onPlayGame}
            onPlayTogether={onPlayTogether}
            onSeeAll={() => onSeeAll(shelf.id)}
          />
        </div>
      ))}
    </>
  );
}
