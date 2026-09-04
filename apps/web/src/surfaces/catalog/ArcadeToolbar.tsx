import { type MutableRefObject } from 'react';
import { useTranslation } from 'react-i18next';
import { CATALOG_SORT_MODES, type CatalogFilterId, type CatalogSortMode } from './catalogSort.js';
import { PixelIcon } from '../../PixelIcon.js';

// Filter chips and the sort dropdown, above Browse everything.
export function ArcadeToolbar({
  canFilterYourGames,
  yourGamesOnly,
  notPlayedOnly,
  onToggleFilter,
  sortMode,
  sortMenuOpen,
  sortMenuRef,
  onToggleSortMenu,
  onSortChange,
}: {
  canFilterYourGames: boolean;
  yourGamesOnly: boolean;
  notPlayedOnly: boolean;
  onToggleFilter: (id: CatalogFilterId) => void;
  sortMode: CatalogSortMode;
  sortMenuOpen: boolean;
  sortMenuRef: MutableRefObject<HTMLDivElement | null>;
  onToggleSortMenu: () => void;
  onSortChange: (mode: CatalogSortMode) => void;
}) {
  const { t } = useTranslation();

  return (
    <div className="catalog-toolbar" role="group" aria-label={t('catalog.toolbarLabel')}>
      {canFilterYourGames ? (
        <button
          type="button"
          className={`catalog-filter-trigger${yourGamesOnly ? ' is-active' : ''}`}
          aria-pressed={yourGamesOnly}
          onClick={() => onToggleFilter('your_games')}
        >
          {t('catalog.filter.your_games')}
        </button>
      ) : null}
      <button
        type="button"
        className={`catalog-filter-trigger${notPlayedOnly ? ' is-active' : ''}`}
        aria-pressed={notPlayedOnly}
        onClick={() => onToggleFilter('not_played')}
      >
        {t('catalog.filter.not_played')}
      </button>
      <div className={`catalog-sort-menu${sortMenuOpen ? ' is-open' : ''}`} ref={sortMenuRef}>
        <button
          type="button"
          className="catalog-sort-trigger"
          aria-expanded={sortMenuOpen}
          aria-haspopup="menu"
          aria-label={t('catalog.sortLabel')}
          onClick={onToggleSortMenu}
        >
          <span className="catalog-sort-trigger-label">{t(`catalog.sort.${sortMode}`)}</span>
          <span className="catalog-sort-caret" aria-hidden="true">
            ▾
          </span>
        </button>
        {sortMenuOpen ? (
          <ul className="catalog-sort-panel" role="menu" aria-label={t('catalog.sortLabel')}>
            {CATALOG_SORT_MODES.map((mode) => (
              <li key={mode} role="none">
                <button
                  type="button"
                  role="menuitemradio"
                  className={`catalog-sort-option${sortMode === mode ? ' is-active' : ''}`}
                  aria-checked={sortMode === mode}
                  onClick={() => onSortChange(mode)}
                >
                  {sortMode === mode ? (
                    <PixelIcon name="check" size={12} />
                  ) : (
                    <span className="catalog-sort-check-spacer" />
                  )}
                  <span className="catalog-sort-option-label">{t(`catalog.sort.${mode}`)}</span>
                </button>
              </li>
            ))}
          </ul>
        ) : null}
      </div>
    </div>
  );
}
