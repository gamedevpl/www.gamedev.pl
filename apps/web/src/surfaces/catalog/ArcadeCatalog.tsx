import { useEffect, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import './catalog-toolbar.css';
import './catalog.css';
import { useAuth } from '../../AuthContext.js';
import { type CatalogEntry } from '../../catalog.js';
import { CatalogCard } from './CatalogCard.js';
import { categorizeCatalogEntry, entriesInCategory } from './catalogCategory.js';
import { buildCatalogPageTokens } from './catalogPagination.js';
import { CATALOG_SORT_MODES, catalogSortNeedsSignals } from './catalogSort.js';
import { CatalogRail, FeaturedGame, RAIL_CARD_LIMIT } from './CatalogRail.js';
import { MascotMoment } from '../../Mascot.js';
import { PixelIcon } from '../../PixelIcon.js';
import { getRecentPlays } from '../../recentPlays.js';
import { watchCatalogScrollIdle } from './catalogScrollIdle.js';
import { useCatalogBrowsing } from './useCatalogBrowsing.js';
import { useCatalogOrdering } from './useCatalogOrdering.js';
import { useCatalogSortAndFilters } from './useCatalogSortAndFilters.js';
import { useCatalogSortSignals } from './useCatalogSortSignals.js';
import { useCreatorShelf } from './useCreatorShelf.js';
import { useFeaturedPool } from './useFeaturedPool.js';
import type { PlayVia } from '../../visitTelemetry.js';

type ArcadeCatalogProps = {
  catalogStatus: 'loading' | 'ready' | 'error';
  catalogError: string | null;
  catalogEntries: CatalogEntry[];
  onPlayGame: (game: CatalogEntry, via?: PlayVia) => void;
  onPlayTogether: (game: CatalogEntry, via?: PlayVia) => void;
  onRetryCatalog: () => void;
  /** Bump after a play so the grid can re-sort from fresh affinity. */
  recommendationsRefreshKey?: number;
  /** Bump after a new submission so Yours pins refresh. */
  creatorGamesRefreshKey?: number;
};

export function ArcadeCatalog({
  catalogStatus,
  catalogError,
  catalogEntries,
  onPlayGame,
  onPlayTogether,
  onRetryCatalog,
  recommendationsRefreshKey = 0,
  creatorGamesRefreshKey = 0,
}: ArcadeCatalogProps) {
  const { t, i18n } = useTranslation();
  const { user, loading: authLoading } = useAuth();
  const viewerUid = user?.uid ?? null;
  const locale = i18n.language;
  const { sortMode, filters, sortMenuOpen, sortMenuRef, toggleSortMenu, handleSortChange, toggleFilter, clearFilters } =
    useCatalogSortAndFilters();
  const { signals, signalsReady } = useCatalogSortSignals(viewerUid, recommendationsRefreshKey);
  const { mySlugs, creatorGamesReady } = useCreatorShelf({
    authLoading,
    viewerUid,
    locale,
    creatorGamesRefreshKey,
  });
  const { featuredPool, featuredPoolReady } = useFeaturedPool();

  useEffect(() => watchCatalogScrollIdle(), []);

  const hasCatalog = catalogStatus === 'ready' && catalogEntries.length > 0;
  // My games only makes sense when signed in and you have a published game of yours.
  const canFilterYourGames = Boolean(user) && mySlugs.size > 0;
  const showControls = hasCatalog;
  const yourGamesOnly = canFilterYourGames && filters.has('your_games');
  const notPlayedOnly = filters.has('not_played');
  const filtersActive = yourGamesOnly || notPlayedOnly;

  const awaitingSignals =
    catalogStatus === 'ready' && catalogEntries.length > 0 && catalogSortNeedsSignals(sortMode) && !signalsReady;
  // Hold the grid while auth is unknown, and while a signed-in shelf is still loading.
  const awaitingCreatorShelf = authLoading || (Boolean(viewerUid) && !creatorGamesReady);
  const catalogPending = catalogStatus === 'loading' || awaitingSignals || awaitingCreatorShelf || !featuredPoolReady;
  const layoutReady = catalogStatus === 'ready' && !awaitingSignals && !awaitingCreatorShelf;

  const { desiredOrder, displayedEntries, userOrderKey } = useCatalogOrdering({
    catalogEntries,
    sortMode,
    filters,
    signals,
    mySlugs,
    canFilterYourGames,
    viewerUid,
    recommendationsRefreshKey,
    layoutReady,
  });
  const {
    categoryFilter,
    clearCategoryFilter,
    shelfCategories,
    browseEntries,
    pageEntries,
    browsePageCount,
    clampedBrowsePage,
    scrollToShelf,
    jumpToAll,
    seeAllInCategory,
    changeBrowsePage,
  } = useCatalogBrowsing({ displayedEntries, userOrderKey });

  // Curated surfaces above the grid, gated on layoutReady like the grid.

  const flagshipEntries = useMemo(() => {
    const bySlug = new Map(catalogEntries.map((entry) => [entry.slug, entry]));
    // Order preserved; an unpublished slug is silently dropped.
    return featuredPool.flatMap((slug) => {
      const entry = bySlug.get(slug);
      return entry ? [entry] : [];
    });
  }, [catalogEntries, featuredPool]);

  // Rotates daily, never two variants; falls back to top recommended.
  const featuredEntry = useMemo(() => {
    if (flagshipEntries.length > 0) {
      const dayIndex = Math.floor(Date.now() / 86_400_000) % flagshipEntries.length;
      return flagshipEntries[dayIndex];
    }
    return desiredOrder[0] ?? null;
  }, [flagshipEntries, desiredOrder]);

  const startHereEntries = useMemo(
    () => flagshipEntries.filter((entry) => entry.slug !== featuredEntry?.slug).slice(0, RAIL_CARD_LIMIT),
    [flagshipEntries, featuredEntry],
  );

  // Fills the featured card's dead space with picks from its shelf.
  const featuredMoreLikeThis = useMemo(() => {
    if (!featuredEntry) return [];
    const [primaryCategory] = categorizeCatalogEntry(featuredEntry);
    return entriesInCategory(desiredOrder, primaryCategory)
      .filter((entry) => entry.slug !== featuredEntry.slug)
      .slice(0, 3);
  }, [featuredEntry, desiredOrder]);

  // Not memoized — recomputes every render, cheap and always fresh.
  const continuePlayingBySlug = new Map(catalogEntries.map((entry) => [entry.slug, entry]));
  const continuePlayingEntries = getRecentPlays()
    .flatMap((slug) => {
      const entry = continuePlayingBySlug.get(slug);
      return entry ? [entry] : [];
    })
    .slice(0, RAIL_CARD_LIMIT);

  const partyEntries = useMemo(
    () => catalogEntries.filter((entry) => entry.multiplayer).slice(0, RAIL_CARD_LIMIT),
    [catalogEntries],
  );

  // No recency window; "this week" reads empty on a thin catalog.
  const recentlyAddedEntries = useMemo(() => {
    const bySlug = new Map(catalogEntries.map((entry) => [entry.slug, entry]));
    return signals.newest
      .flatMap((slug) => {
        const entry = bySlug.get(slug);
        return entry ? [entry] : [];
      })
      .slice(0, RAIL_CARD_LIMIT);
  }, [catalogEntries, signals.newest]);

  // Also wait for the pool, or the rail shifts after it loads.
  const showCurated = layoutReady && hasCatalog && featuredPoolReady;

  const emptyMessage =
    yourGamesOnly && notPlayedOnly && (catalogEntries.length > 0 || mySlugs.size > 0)
      ? t('catalog.emptyYourGamesNotPlayed')
      : yourGamesOnly
        ? t('catalog.emptyYourGames')
        : notPlayedOnly && catalogEntries.length > 0
          ? t('catalog.emptyNotPlayed')
          : t('catalog.empty');
  const showEmpty = layoutReady && displayedEntries.length === 0;
  // Category filter emptied the shelf, but the wider catalog is not empty.
  const showCategoryEmpty =
    layoutReady && displayedEntries.length > 0 && categoryFilter !== null && browseEntries.length === 0;

  return (
    <>
      {showCurated && featuredEntry && (
        <div id="play-anchor">
          <FeaturedGame
            entry={featuredEntry}
            onPlayGame={onPlayGame}
            onPlayTogether={onPlayTogether}
            moreLikeThis={featuredMoreLikeThis}
          />
        </div>
      )}
      {showCurated && (
        <>
          <CatalogRail
            heading={t('catalog.rails.startHere')}
            entries={startHereEntries}
            via="rail_start_here"
            onPlayGame={onPlayGame}
          />
          <CatalogRail
            heading={t('catalog.rails.continuePlaying')}
            entries={continuePlayingEntries}
            via="rail_continue"
            onPlayGame={onPlayGame}
          />
          <CatalogRail
            id="party-rail"
            heading={t('catalog.rails.party')}
            entries={partyEntries}
            via="rail_party"
            onPlayGame={onPlayGame}
            onPlayTogether={onPlayTogether}
            headingAside={partyEntries.length > 0 ? String(partyEntries.length) : undefined}
          />
          <CatalogRail
            heading={t('catalog.rails.recentlyAdded')}
            entries={recentlyAddedEntries}
            via="rail_new"
            onPlayGame={onPlayGame}
          />
        </>
      )}
      {showCurated && shelfCategories.length > 0 && (
        <>
          <nav className="catalog-jumpbar" aria-label={t('catalog.jumpBarLabel')}>
            <button type="button" className="jump-chip is-all" onClick={jumpToAll}>
              {t('catalog.jumpAll')}
            </button>
            {shelfCategories.map((shelf) => (
              <button key={shelf.id} type="button" className="jump-chip" onClick={() => scrollToShelf(shelf.id)}>
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
                onSeeAll={() => seeAllInCategory(shelf.id)}
              />
            </div>
          ))}
        </>
      )}
      <section id="arcade" className={`arcade-section${catalogPending ? ' is-pending' : ''}`}>
        <div id="browse-everything" className="arcade-header">
          <div className="arcade-title-row">
            <h2 className="arcade-title">{t('catalog.browseEverything')}</h2>
          </div>
          {showControls ? (
            <div className="catalog-toolbar" role="group" aria-label={t('catalog.toolbarLabel')}>
              {canFilterYourGames ? (
                <button
                  type="button"
                  className={`catalog-filter-trigger${yourGamesOnly ? ' is-active' : ''}`}
                  aria-pressed={yourGamesOnly}
                  onClick={() => toggleFilter('your_games')}
                >
                  {t('catalog.filter.your_games')}
                </button>
              ) : null}
              <button
                type="button"
                className={`catalog-filter-trigger${notPlayedOnly ? ' is-active' : ''}`}
                aria-pressed={notPlayedOnly}
                onClick={() => toggleFilter('not_played')}
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
                  onClick={toggleSortMenu}
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
                          onClick={() => handleSortChange(mode)}
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
          ) : null}
        </div>

        {categoryFilter ? (
          <div className="catalog-category-active">
            <span>{t('catalog.categoryFilterActive', { category: t(`catalog.categories.${categoryFilter}`) })}</span>
            <button type="button" className="catalog-category-clear" onClick={clearCategoryFilter}>
              {t('catalog.clearFilters')}
            </button>
          </div>
        ) : null}

        {catalogStatus === 'ready' && catalogError ? (
          <div className="catalog-refresh-error" role="status">
            <p className="catalog-refresh-error__text">{t('catalog.refreshError', { message: catalogError })}</p>
            <button type="button" className="secondary-btn catalog-refresh-error__retry" onClick={onRetryCatalog}>
              <PixelIcon name="undo" size={13} /> {t('catalog.retry')}
            </button>
          </div>
        ) : null}

        {catalogPending ? (
          <MascotMoment className="catalog-state" emotion="busy" size={56} title={t('mascot.busyAlt')}>
            <p>{t('catalog.loading')}</p>
          </MascotMoment>
        ) : catalogStatus === 'error' ? (
          <MascotMoment className="load-error" emotion="sad" size={64} title={t('mascot.sadAlt')}>
            <p className="error" role="alert">
              {t('catalog.error', { message: catalogError ?? t('errors.generic') })}
            </p>
            <button type="button" className="secondary-btn" onClick={onRetryCatalog}>
              <PixelIcon name="undo" size={13} /> {t('catalog.retry')}
            </button>
          </MascotMoment>
        ) : showEmpty ? (
          <MascotMoment className="catalog-state" emotion="curious" size={64} title={t('mascot.curiousAlt')}>
            <p>{emptyMessage}</p>
            {filtersActive && (catalogEntries.length > 0 || mySlugs.size > 0) ? (
              <button type="button" className="secondary-btn" onClick={clearFilters}>
                {t('catalog.clearFilters')}
              </button>
            ) : null}
          </MascotMoment>
        ) : showCategoryEmpty ? (
          <MascotMoment className="catalog-state" emotion="curious" size={64} title={t('mascot.curiousAlt')}>
            <p>{t('catalog.emptyCategory', { category: t(`catalog.categories.${categoryFilter}`) })}</p>
            <button type="button" className="secondary-btn" onClick={clearCategoryFilter}>
              {t('catalog.clearFilters')}
            </button>
          </MascotMoment>
        ) : (
          <>
            <div className="catalog-grid">
              {pageEntries.map((entry) => (
                <CatalogCard
                  key={entry.slug}
                  entry={entry}
                  isYours={mySlugs.has(entry.slug)}
                  onPlayGame={(game) => onPlayGame(game, 'grid')}
                  onPlayTogether={(game) => onPlayTogether(game, 'grid')}
                />
              ))}
            </div>
            {browsePageCount > 1 ? (
              <nav className="catalog-pager" aria-label={t('catalog.pagination.label')}>
                <button
                  type="button"
                  disabled={clampedBrowsePage === 1}
                  aria-label={t('catalog.pagination.prev')}
                  onClick={() => changeBrowsePage(Math.max(1, clampedBrowsePage - 1))}
                >
                  &larr;
                </button>
                {buildCatalogPageTokens(clampedBrowsePage, browsePageCount).map((token, index) =>
                  token === 'ellipsis' ? (
                    <span key={`ellipsis-${index}`} className="catalog-pager-ellipsis">
                      &hellip;
                    </span>
                  ) : (
                    <button
                      key={token}
                      type="button"
                      className={token === clampedBrowsePage ? 'is-active' : undefined}
                      aria-current={token === clampedBrowsePage ? 'page' : undefined}
                      aria-label={t('catalog.pagination.page', { page: token })}
                      onClick={() => changeBrowsePage(token)}
                    >
                      {token}
                    </button>
                  ),
                )}
                <button
                  type="button"
                  disabled={clampedBrowsePage === browsePageCount}
                  aria-label={t('catalog.pagination.next')}
                  onClick={() => changeBrowsePage(Math.min(browsePageCount, clampedBrowsePage + 1))}
                >
                  &rarr;
                </button>
              </nav>
            ) : null}
          </>
        )}
      </section>
    </>
  );
}
