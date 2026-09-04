import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import './catalog-toolbar.css';
import './catalog.css';
import { useAuth } from '../../AuthContext.js';
import { type CatalogEntry } from '../../catalog.js';
import { CatalogCard } from './CatalogCard.js';
import {
  CATALOG_CATEGORY_IDS,
  categorizeCatalogEntry,
  entriesInCategory,
  type CatalogCategoryId,
} from './catalogCategory.js';
import { buildCatalogPageTokens, CATALOG_PAGE_SIZE } from './catalogPagination.js';
import {
  applyCatalogFilters,
  CATALOG_SORT_MODES,
  catalogSortNeedsSignals,
  DEFAULT_CATALOG_SORT,
  EMPTY_CATALOG_SORT_SIGNALS,
  orderCatalogEntries,
  readCatalogFilters,
  readCatalogSortMode,
  writeCatalogFilters,
  writeCatalogSortMode,
  type CatalogFilterId,
  type CatalogSortMode,
  type CatalogSortSignals,
} from './catalogSort.js';
import { CatalogRail, FeaturedGame } from './CatalogRail.js';
import { loadCreatorGames, publishedCreatorSlugs, type CreatorGameItem } from '../../creatorGames.js';
import { fetchFeaturedSlugs } from '../../featuredApi.js';
import { MascotMoment } from '../../Mascot.js';
import { PixelIcon } from '../../PixelIcon.js';
import { getRecentPlays } from '../../recentPlays.js';
import {
  fetchCatalogSortSignals,
  readCachedCatalogSortPayload,
  type CatalogSortPayload,
} from '../../recommendationsApi.js';
import { watchCatalogScrollIdle } from './catalogScrollIdle.js';
import type { PlayVia } from '../../visitTelemetry.js';

// Rail length before it scrolls, same for every rail.
const RAIL_CARD_LIMIT = 12;

// Caps the featured-pool wait; a stall must not block the grid.
const FEATURED_POOL_TIMEOUT_MS = 1200;

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

function payloadToSignals(payload: CatalogSortPayload): CatalogSortSignals {
  return {
    recommended: payload.items.map((item) => item.slug),
    newest: payload.newest,
    sessions: new Map(payload.popularity.map((row) => [row.slug, row.sessions])),
    affinityLastPlayed: new Map(payload.lastPlayed.map((row) => [row.slug, row.lastPlayedAt])),
  };
}

function sameCatalogSortSignals(a: CatalogSortSignals, b: CatalogSortSignals): boolean {
  if (a.recommended.length !== b.recommended.length || a.newest.length !== b.newest.length) return false;
  if (a.sessions.size !== b.sessions.size || a.affinityLastPlayed.size !== b.affinityLastPlayed.size) return false;
  for (let i = 0; i < a.recommended.length; i++) {
    if (a.recommended[i] !== b.recommended[i]) return false;
  }
  for (let i = 0; i < a.newest.length; i++) {
    if (a.newest[i] !== b.newest[i]) return false;
  }
  for (const [slug, sessions] of a.sessions) {
    if (b.sessions.get(slug) !== sessions) return false;
  }
  for (const [slug, at] of a.affinityLastPlayed) {
    if (b.affinityLastPlayed.get(slug) !== at) return false;
  }
  return true;
}

function initialSignals(viewerUid: string | null): { signals: CatalogSortSignals; ready: boolean } {
  if (typeof sessionStorage === 'undefined') {
    return { signals: EMPTY_CATALOG_SORT_SIGNALS, ready: false };
  }
  const cached = readCachedCatalogSortPayload(viewerUid);
  if (!cached) return { signals: EMPTY_CATALOG_SORT_SIGNALS, ready: false };
  return { signals: payloadToSignals(cached), ready: true };
}

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
  const [sortMode, setSortMode] = useState<CatalogSortMode>(() =>
    typeof localStorage === 'undefined' ? DEFAULT_CATALOG_SORT : readCatalogSortMode(),
  );
  const [filters, setFilters] = useState<Set<CatalogFilterId>>(() =>
    typeof localStorage === 'undefined' ? new Set() : readCatalogFilters(),
  );
  const [sortMenuOpen, setSortMenuOpen] = useState(false);
  const sortMenuRef = useRef<HTMLDivElement | null>(null);
  const [signals, setSignals] = useState<CatalogSortSignals>(() => initialSignals(viewerUid).signals);
  const [signalsReady, setSignalsReady] = useState(() => initialSignals(viewerUid).ready);
  const [creatorItems, setCreatorItems] = useState<CreatorGameItem[]>([]);
  // Starts false until auth resolves: a null→uid transition must not paint an
  // unpinned grid first and then flip back to loading when the shelf gate applies.
  const [creatorGamesReady, setCreatorGamesReady] = useState(false);
  /** Grid order committed for the current sort/filter/viewer; later signal refresh must not reshuffle. */
  const [displayedEntries, setDisplayedEntries] = useState<CatalogEntry[]>([]);
  const desiredOrderRef = useRef<CatalogEntry[]>([]);
  const paintedOrderKeyRef = useRef<string | null>(null);
  // Set by a shelf's See all; cleared by All or Clear.
  const [categoryFilter, setCategoryFilter] = useState<CatalogCategoryId | null>(null);
  const [browsePage, setBrowsePage] = useState(1);

  useEffect(() => watchCatalogScrollIdle(), []);

  // Fetch sort signals as soon as the arcade mounts — in parallel with App's
  // catalog fetch — so cold load waits for max(catalog, signals), not their sum.
  // Cache is viewer-scoped; a matching cache paints immediately, then the network
  // response replaces it only when the payload actually differs (account switch,
  // affinity drift) or an explicit post-play refresh asked for a re-rank.
  useEffect(() => {
    let cancelled = false;
    const cached = readCachedCatalogSortPayload(viewerUid);
    if (cached) {
      setSignals(payloadToSignals(cached));
      setSignalsReady(true);
    } else {
      setSignalsReady(false);
    }
    const forceReplace = recommendationsRefreshKey > 0;
    void fetchCatalogSortSignals(getRecentPlays(), viewerUid)
      .then((payload) => {
        if (cancelled) return;
        const next = payloadToSignals(payload);
        if (forceReplace) {
          setSignals(next);
        } else {
          setSignals((prev) => (sameCatalogSortSignals(prev, next) ? prev : next));
        }
        setSignalsReady(true);
      })
      .catch(() => {
        // Transport failure must not leave the arcade stuck on the loading mascot.
        if (cancelled) return;
        setSignalsReady(true);
      });
    return () => {
      cancelled = true;
    };
  }, [recommendationsRefreshKey, viewerUid]);

  useEffect(() => {
    if (authLoading) return;
    if (!viewerUid) {
      setCreatorItems([]);
      setCreatorGamesReady(true);
      return;
    }
    // Drop the previous viewer's shelf immediately on account switch.
    setCreatorItems([]);
    setCreatorGamesReady(false);
  }, [authLoading, viewerUid, locale]);

  // Creator shelf feeds the Studio chip and "Yours" pins — never the grid itself.
  useEffect(() => {
    if (authLoading || !viewerUid) return;
    let cancelled = false;
    void loadCreatorGames(locale).then((items) => {
      if (cancelled) return;
      setCreatorItems(items);
      setCreatorGamesReady(true);
    });
    const timer = window.setInterval(() => {
      void loadCreatorGames(locale).then((items) => {
        if (!cancelled) setCreatorItems(items);
      });
    }, 30_000);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [authLoading, viewerUid, creatorGamesRefreshKey, locale]);

  // Close the sort menu on outside tap or Escape — phones have no hover to dismiss it.
  useEffect(() => {
    if (!sortMenuOpen) return;
    const onPointer = (event: PointerEvent) => {
      if (sortMenuRef.current && !sortMenuRef.current.contains(event.target as Node)) {
        setSortMenuOpen(false);
      }
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setSortMenuOpen(false);
    };
    const timer = window.setTimeout(() => {
      document.addEventListener('pointerdown', onPointer);
    }, 0);
    document.addEventListener('keydown', onKey);
    return () => {
      window.clearTimeout(timer);
      document.removeEventListener('pointerdown', onPointer);
      document.removeEventListener('keydown', onKey);
    };
  }, [sortMenuOpen]);

  const mySlugs = useMemo(() => publishedCreatorSlugs(creatorItems), [creatorItems]);

  // Curated pool for the featured slot; fetched once, not personalized.
  const [featuredPool, setFeaturedPool] = useState<string[]>([]);
  // Gates showCurated; fetchFeaturedSlugs fails open, so this always resolves.
  const [featuredPoolReady, setFeaturedPoolReady] = useState(false);
  useEffect(() => {
    let settled = false;
    const settle = (slugs: string[]) => {
      if (settled) return;
      settled = true;
      setFeaturedPool(slugs);
      setFeaturedPoolReady(true);
    };
    void fetchFeaturedSlugs().then(settle);
    const timer = window.setTimeout(() => settle([]), FEATURED_POOL_TIMEOUT_MS);
    return () => {
      settled = true;
      window.clearTimeout(timer);
    };
  }, []);

  const hasCatalog = catalogStatus === 'ready' && catalogEntries.length > 0;
  // My games only makes sense when signed in and you have a published game of yours.
  const canFilterYourGames = Boolean(user) && mySlugs.size > 0;
  const showControls = hasCatalog;
  const yourGamesOnly = canFilterYourGames && filters.has('your_games');
  const notPlayedOnly = filters.has('not_played');
  const filtersActive = yourGamesOnly || notPlayedOnly;

  const desiredOrder = useMemo(() => {
    // Ignore a sticky your_games pref when signed out or you have nothing yours —
    // otherwise the whole catalog would look empty for no good reason.
    const activeFilters = canFilterYourGames ? filters : new Set([...filters].filter((id) => id !== 'your_games'));
    const filtered = applyCatalogFilters(catalogEntries, activeFilters, signals.affinityLastPlayed, mySlugs);
    return orderCatalogEntries(filtered, sortMode, signals, mySlugs);
  }, [catalogEntries, sortMode, filters, signals, mySlugs, canFilterYourGames]);
  desiredOrderRef.current = desiredOrder;

  const filterKey = [...filters].sort().join(',');
  // recommendationsRefreshKey: post-play re-rank is deliberate user-visible intent.
  const userOrderKey = `${sortMode}|${filterKey}|${viewerUid ?? ''}|r${recommendationsRefreshKey}`;

  // A stale page number from a filtered list is not a page.
  useEffect(() => {
    setBrowsePage(1);
  }, [userOrderKey, categoryFilter]);

  const awaitingSignals =
    catalogStatus === 'ready' && catalogEntries.length > 0 && catalogSortNeedsSignals(sortMode) && !signalsReady;
  // Hold the grid while auth is unknown, and while a signed-in shelf is still loading.
  const awaitingCreatorShelf = authLoading || (Boolean(viewerUid) && !creatorGamesReady);
  const catalogPending = catalogStatus === 'loading' || awaitingSignals || awaitingCreatorShelf || !featuredPoolReady;
  const layoutReady = catalogStatus === 'ready' && !awaitingSignals && !awaitingCreatorShelf;

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

  // Commit order once per sort/filter/viewer (and when the shelf/signals first land).
  // A later recommendations refresh that differs from the sessionStorage cache must
  // not reshuffle cards under the reader's thumb.
  useLayoutEffect(() => {
    if (!layoutReady) {
      paintedOrderKeyRef.current = null;
      return;
    }
    if (paintedOrderKeyRef.current === userOrderKey) return;
    paintedOrderKeyRef.current = userOrderKey;
    setDisplayedEntries(desiredOrderRef.current);
  }, [layoutReady, userOrderKey]);

  function handleSortChange(mode: CatalogSortMode) {
    setSortMode(mode);
    writeCatalogSortMode(mode);
    setSortMenuOpen(false);
  }

  function toggleFilter(id: CatalogFilterId) {
    setFilters((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      writeCatalogFilters(next);
      return next;
    });
  }

  function clearFilters() {
    setFilters(() => {
      const next = new Set<CatalogFilterId>();
      writeCatalogFilters(next);
      return next;
    });
  }

  function scrollToShelf(id: CatalogCategoryId) {
    document.getElementById(`shelf-${id}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  function scrollToBrowseEverything() {
    document.getElementById('browse-everything')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  function jumpToAll() {
    setCategoryFilter(null);
    scrollToBrowseEverything();
  }

  function seeAllInCategory(id: CatalogCategoryId) {
    setCategoryFilter(id);
    scrollToBrowseEverything();
  }

  // A shorter destination page must not leave the reader stranded past its end.
  function changeBrowsePage(next: number) {
    setBrowsePage(next);
    scrollToBrowseEverything();
  }

  // Shelves below the fold, same order as the grid, grouped by category.
  const shelfCategories = useMemo(
    () =>
      CATALOG_CATEGORY_IDS.map((id) => ({
        id,
        entries: entriesInCategory(displayedEntries, id).slice(0, RAIL_CARD_LIMIT),
      })).filter((shelf) => shelf.entries.length > 0),
    [displayedEntries],
  );

  const browseEntries = useMemo(
    () => (categoryFilter ? entriesInCategory(displayedEntries, categoryFilter) : displayedEntries),
    [displayedEntries, categoryFilter],
  );
  const browsePageCount = Math.max(1, Math.ceil(browseEntries.length / CATALOG_PAGE_SIZE));
  const clampedBrowsePage = Math.min(browsePage, browsePageCount);
  const pageEntries = useMemo(
    () => browseEntries.slice((clampedBrowsePage - 1) * CATALOG_PAGE_SIZE, clampedBrowsePage * CATALOG_PAGE_SIZE),
    [browseEntries, clampedBrowsePage],
  );

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
                  onClick={() => setSortMenuOpen((open) => !open)}
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
            <button type="button" className="catalog-category-clear" onClick={() => setCategoryFilter(null)}>
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
            <button type="button" className="secondary-btn" onClick={() => setCategoryFilter(null)}>
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
