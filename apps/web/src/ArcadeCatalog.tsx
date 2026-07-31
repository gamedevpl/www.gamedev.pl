import { useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useAuth } from './AuthContext.js';
import { catalogMediaUrl, isPlatformAuthor, type CatalogEntry } from './catalog.js';
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
import {
  CREATOR_LIVE_STATUSES,
  CREATOR_STATUS_ICONS,
  inProgressCreatorGames,
  loadCreatorGames,
  publishedCreatorSlugs,
  type CreatorGameItem,
} from './creatorGames.js';
import { MascotMoment } from './Mascot.js';
import { PixelIcon } from './PixelIcon.js';
import { getRecentPlays } from './recentPlays.js';
import {
  fetchCatalogSortSignals,
  readCachedCatalogSortPayload,
  type CatalogSortPayload,
} from './recommendationsApi.js';
import { formatRelativeTime } from './relativeTime.js';
import { useInView } from './useInView.js';

type ArcadeCatalogProps = {
  catalogStatus: 'loading' | 'ready' | 'error';
  catalogError: string | null;
  catalogEntries: CatalogEntry[];
  onPlayGame: (game: CatalogEntry) => void;
  onPlayTogether: (game: CatalogEntry) => void;
  onRetryCatalog: () => void;
  /** Bump after a play so the grid can re-sort from fresh affinity. */
  recommendationsRefreshKey?: number;
  /** Bump after a new submission so in-progress cards appear immediately. */
  creatorGamesRefreshKey?: number;
  /** Open the studio view for an in-progress build or creator game by address (slug or token). */
  onOpenStatus?: (address: string) => void;
  onOpenStudio?: () => void;
};

function humanizeMoment(name: string): string {
  return name
    .split('-')
    .map((word) => `${word.charAt(0).toUpperCase()}${word.slice(1)}`)
    .join(' ');
}

function CatalogCard({
  entry,
  isYours = false,
  onPlayGame,
  onPlayTogether,
}: {
  entry: CatalogEntry;
  isYours?: boolean;
  onPlayGame: (game: CatalogEntry) => void;
  onPlayTogether: (game: CatalogEntry) => void;
}) {
  const { t } = useTranslation();
  const videoRef = useRef<HTMLVideoElement>(null);
  // Defer preview media until the card is near the viewport — below-fold cards
  // must not fetch posters/videos on initial home load.
  const { ref: mediaRef, inView } = useInView<HTMLDivElement>({ rootMargin: '200px 0px', once: true });
  const [selectedScreenshot, setSelectedScreenshot] = useState(0);
  const [isPreviewPlaying, setIsPreviewPlaying] = useState(false);
  const [isPreviewPinned, setIsPreviewPinned] = useState(false);
  const screenshots = entry.media?.screenshots ?? [];
  const selected = screenshots[selectedScreenshot] ?? screenshots[0];
  const posterUrl = selected && inView ? catalogMediaUrl(entry.slug, selected.file) : undefined;
  const videoUrl = entry.media?.video && inView ? catalogMediaUrl(entry.slug, entry.media.video) : null;
  const hasVideo = Boolean(entry.media?.video);

  function playPreview() {
    const video = videoRef.current;
    if (!video) return;
    void video.play().then(
      () => setIsPreviewPlaying(true),
      () => setIsPreviewPlaying(false),
    );
  }

  function pausePreview(reset = false) {
    const video = videoRef.current;
    if (!video) return;
    video.pause();
    if (reset) {
      video.currentTime = 0;
    }
    setIsPreviewPlaying(false);
  }

  function togglePreview() {
    if (isPreviewPlaying) {
      setIsPreviewPinned(false);
      pausePreview();
    } else {
      setIsPreviewPinned(true);
      playPreview();
    }
  }

  function selectScreenshot(index: number) {
    setSelectedScreenshot(index);
    setIsPreviewPinned(false);
    pausePreview(true);
  }

  return (
    <article className="catalog-card">
      <div
        ref={mediaRef}
        className="catalog-media"
        tabIndex={hasVideo ? 0 : undefined}
        onPointerEnter={
          hasVideo
            ? (event) => {
                if (event.pointerType === 'mouse') playPreview();
              }
            : undefined
        }
        onPointerLeave={
          hasVideo
            ? (event) => {
                if (event.pointerType === 'mouse' && !isPreviewPinned) pausePreview(true);
              }
            : undefined
        }
        onFocus={
          hasVideo
            ? (event) => {
                if (event.target === event.currentTarget) playPreview();
              }
            : undefined
        }
        onBlur={
          hasVideo
            ? (event) => {
                if (!event.currentTarget.contains(event.relatedTarget)) {
                  setIsPreviewPinned(false);
                  pausePreview(true);
                }
              }
            : undefined
        }
      >
        {videoUrl ? (
          <video
            key={posterUrl}
            ref={videoRef}
            className="catalog-preview"
            src={videoUrl}
            poster={posterUrl}
            muted
            loop
            playsInline
            preload="metadata"
            aria-label={t('catalog.previewVideo', { title: entry.title })}
            onPlay={() => setIsPreviewPlaying(true)}
            onPause={() => setIsPreviewPlaying(false)}
          />
        ) : posterUrl ? (
          <img
            className="catalog-preview"
            src={posterUrl}
            alt={t('catalog.previewImage', { title: entry.title })}
            loading="lazy"
            decoding="async"
          />
        ) : (
          <div className="catalog-preview-fallback" aria-hidden="true">
            <span>{entry.title.charAt(0)}</span>
            <small>{entry.genre}</small>
          </div>
        )}

        {/* Both badges anchor the same corner, so they stack in a column instead of
            each claiming top:10px/left:10px independently — the previous version had
            the AI disclosure drawn directly on top of the preview toggle on every
            card with a video. Flex + gap rather than a fixed pixel offset because the
            toggle's Polish label ("Wstrzymaj podgląd") runs longer than the English
            one and can wrap; a magic number here would work in one locale and not
            the other. */}
        <div className="catalog-badges-top-left">
          {/* The label is in its own span because a finger gets the icon alone: at
              44px the labelled pill is 127px wide (more in Polish) and ran into the
              moment thumbnails on the other side of the card. aria-label carries the
              wording that the CSS hides, so the control never goes unnamed. */}
          {hasVideo && (
            <button
              type="button"
              className="preview-toggle"
              aria-pressed={isPreviewPlaying}
              aria-label={isPreviewPlaying ? t('catalog.pausePreview') : t('catalog.watchPreview')}
              disabled={!inView}
              onClick={togglePreview}
            >
              <PixelIcon name={isPreviewPlaying ? 'pause' : 'play'} size={11} />
              <span className="btn-label">
                {isPreviewPlaying ? t('catalog.pausePreview') : t('catalog.watchPreview')}
              </span>
            </button>
          )}

          {/* The one thing a phone visitor needs from the derived `touch` class: a game
              its own source says cannot be driven by a finger. Only 'none' earns a
              badge — 'gamekit'/'native' are the norm for nearly every game, so labelling
              those would put a pill on almost every card to say "works normally", while
              'controllers' already announces itself through the party badge below.
              Hidden on a mouse by CSS, where "keyboard only" is not news. */}
          {entry.touch === 'none' && (
            <span className="touch-warning-pill" title={t('catalog.keyboardOnlyTooltip')}>
              <PixelIcon name="gamepad" size={10} /> {t('catalog.keyboardOnly')}
            </span>
          )}

          {/* AI Act art. 50: content generated by an AI system has to be disclosed as
              such to the people who encounter it. The catalog card is where someone
              first meets a game, so the disclosure belongs here and not only in the
              terms — a label nobody sees before choosing is not a disclosure. */}
          <span className="ai-pill" title={t('ai.generatedTooltip')}>
            <PixelIcon name="sparkle" size={10} /> {t('ai.generatedShort')}
          </span>
          {isYours ? (
            <span className="yours-pill" title={t('catalog.yoursBadge')}>
              <PixelIcon name="user" size={10} /> {t('catalog.yoursBadge')}
            </span>
          ) : null}
        </div>

        <span className="genre-pill">{entry.genre}</span>

        {inView && screenshots.length > 1 && (
          <div className="catalog-moments" aria-label={t('catalog.gameMoments', { title: entry.title })}>
            {screenshots.slice(0, 4).map((screenshot, index) => (
              <button
                key={screenshot.file}
                type="button"
                className={index === selectedScreenshot ? 'catalog-moment is-selected' : 'catalog-moment'}
                aria-label={t('catalog.viewMoment', { moment: humanizeMoment(screenshot.name), title: entry.title })}
                aria-pressed={index === selectedScreenshot}
                onClick={() => selectScreenshot(index)}
              >
                <img src={catalogMediaUrl(entry.slug, screenshot.file)} alt="" loading="lazy" decoding="async" />
              </button>
            ))}
          </div>
        )}

        {/* Title, one-line control hint and the Play CTA sit on top of the preview over
            a bottom scrim, so the card is just the media box — no separate content
            row underneath. Saves ~90px of height per card without dropping any info. */}
        <div className="catalog-overlay">
          <h3 className="card-title">
            {entry.title}
            {entry.multiplayer && (
              <span className="card-party-badge">
                <PixelIcon name="phone" size={12} /> {t('party.playersBadge', { max: entry.multiplayer.maxPlayers })}
              </span>
            )}
            {/* Says what the game will do, not what this visitor will get: a signed-out
                player sees the badge and no save, which is the honest ordering — the
                promise belongs to the game, and signing in is what claims it. */}
            {entry.saves === 'player' && (
              <span className="card-saves-badge">
                <PixelIcon name="clock" size={12} /> {t('catalog.savesBadge')}
              </span>
            )}
            {/* The one badge that is about other people rather than about the game.
                Worth its own colour: "somebody else has been here" is a different kind
                of reason to click than "this remembers you". */}
            {entry.world === 'shared' && (
              <span className="card-world-badge">
                <PixelIcon name="star" size={12} /> {t('catalog.worldBadge')}
              </span>
            )}
          </h3>
          <p className="card-author">
            {t('player.byAuthor', {
              author: isPlatformAuthor(entry.submittedBy) ? t('catalog.platformAuthor') : entry.submittedBy,
            })}
          </p>
          <div className="card-actions">
            <button className="primary-btn" onClick={() => onPlayGame(entry)}>
              <PixelIcon name="play" size={13} /> {t('catalog.play')}
            </button>
            {entry.multiplayer && (
              <button className="secondary-btn party-btn" onClick={() => onPlayTogether(entry)}>
                <PixelIcon name="phone" size={13} /> {t('party.playTogether')}
              </button>
            )}
          </div>
        </div>
      </div>
    </article>
  );
}

function payloadToSignals(payload: CatalogSortPayload): CatalogSortSignals {
  return {
    recommended: payload.items.map((item) => item.slug),
    newest: payload.newest,
    sessions: new Map(payload.popularity.map((row) => [row.slug, row.sessions])),
    affinityLastPlayed: new Map(payload.lastPlayed.map((row) => [row.slug, row.lastPlayedAt])),
  };
}

function initialSignals(): { signals: CatalogSortSignals; ready: boolean } {
  if (typeof sessionStorage === 'undefined') {
    return { signals: EMPTY_CATALOG_SORT_SIGNALS, ready: false };
  }
  const cached = readCachedCatalogSortPayload();
  if (!cached) return { signals: EMPTY_CATALOG_SORT_SIGNALS, ready: false };
  return { signals: payloadToSignals(cached), ready: true };
}

function InProgressCard({ item, onOpen }: { item: CreatorGameItem; onOpen: (address: string) => void }) {
  const { t, i18n } = useTranslation();
  const status = item.status;
  const isLive = status !== null && CREATOR_LIVE_STATUSES.has(status);
  // Prefer the permanent address when we have one — the status token still works, but
  // it is the capability grant the studio was redesigned to keep out of the URL bar.
  const address = item.slug ?? item.token;

  return (
    <article className={`catalog-card catalog-build-card${isLive ? ' is-live' : ''}`}>
      <div className="catalog-build-body">
        <span className={`my-game-status my-game-status-${status ?? 'unknown'}`}>
          <PixelIcon name={status ? CREATOR_STATUS_ICONS[status] : 'clock'} size={12} />{' '}
          {status ? t(`statusView.states.${status}.label`) : t('myGames.checking')}
        </span>
        <span className="yours-pill catalog-build-yours">
          <PixelIcon name="user" size={10} /> {t('catalog.yoursBadge')}
        </span>
        <h3 className="card-title">{item.title}</h3>
        <p className="catalog-build-meta">{formatRelativeTime(item.createdAt, i18n.language)}</p>
        <button type="button" className="primary-btn" onClick={() => onOpen(address)}>
          <PixelIcon name="eye" size={13} /> {t('myGames.open')}
        </button>
      </div>
    </article>
  );
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
  onOpenStatus,
  onOpenStudio,
}: ArcadeCatalogProps) {
  const { t, i18n } = useTranslation();
  const { user } = useAuth();
  const locale = i18n.language;
  const [sortMode, setSortMode] = useState<CatalogSortMode>(() =>
    typeof localStorage === 'undefined' ? DEFAULT_CATALOG_SORT : readCatalogSortMode(),
  );
  const [filters, setFilters] = useState<Set<CatalogFilterId>>(() =>
    typeof localStorage === 'undefined' ? new Set() : readCatalogFilters(),
  );
  const [sortMenuOpen, setSortMenuOpen] = useState(false);
  const sortMenuRef = useRef<HTMLDivElement | null>(null);
  const initial = initialSignals();
  const [signals, setSignals] = useState<CatalogSortSignals>(initial.signals);
  const [signalsReady, setSignalsReady] = useState(initial.ready);
  const [creatorItems, setCreatorItems] = useState<CreatorGameItem[]>([]);

  useEffect(() => {
    if (catalogStatus !== 'ready' || catalogEntries.length === 0) {
      return;
    }
    let cancelled = false;
    void fetchCatalogSortSignals(getRecentPlays()).then((payload) => {
      if (cancelled) return;
      setSignals(payloadToSignals(payload));
      setSignalsReady(true);
    });
    return () => {
      cancelled = true;
    };
  }, [catalogStatus, catalogEntries, recommendationsRefreshKey]);

  // Creator games (published + in progress) — only while the gallery is visible.
  useEffect(() => {
    if (!user) {
      setCreatorItems([]);
      return;
    }
    if (catalogStatus === 'loading') return;
    let cancelled = false;
    void loadCreatorGames(locale).then((items) => {
      if (!cancelled) setCreatorItems(items);
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
  }, [user, catalogStatus, creatorGamesRefreshKey, locale]);

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
  const inProgress = useMemo(() => inProgressCreatorGames(creatorItems), [creatorItems]);
  const liveCount = useMemo(
    () => inProgress.filter((item) => item.status !== null && CREATOR_LIVE_STATUSES.has(item.status)).length,
    [inProgress],
  );

  const hasCatalog = catalogStatus === 'ready' && catalogEntries.length > 0;
  const hasBuilds = inProgress.length > 0;
  // My games only makes sense when signed in and you actually have something yours.
  const canFilterYourGames = Boolean(user) && (mySlugs.size > 0 || hasBuilds);
  const showControls = hasCatalog || hasBuilds;
  const yourGamesOnly = canFilterYourGames && filters.has('your_games');
  const notPlayedOnly = filters.has('not_played');
  const filtersActive = yourGamesOnly || notPlayedOnly;

  const orderedEntries = useMemo(() => {
    // Ignore a sticky your_games pref when signed out or you have nothing yours —
    // otherwise the whole catalog would look empty for no good reason.
    const activeFilters = canFilterYourGames ? filters : new Set([...filters].filter((id) => id !== 'your_games'));
    const filtered = applyCatalogFilters(catalogEntries, activeFilters, signals.affinityLastPlayed, mySlugs);
    return orderCatalogEntries(filtered, sortMode, signals, mySlugs);
  }, [catalogEntries, sortMode, filters, signals, mySlugs, canFilterYourGames]);

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
  const awaitingSignals =
    catalogStatus === 'ready' && catalogEntries.length > 0 && catalogSortNeedsSignals(sortMode) && !signalsReady;

  const emptyMessage =
    yourGamesOnly && notPlayedOnly && (catalogEntries.length > 0 || mySlugs.size > 0)
      ? t('catalog.emptyYourGamesNotPlayed')
      : yourGamesOnly
        ? t('catalog.emptyYourGames')
        : notPlayedOnly && catalogEntries.length > 0
          ? t('catalog.emptyNotPlayed')
          : t('catalog.empty');
  const showEmpty =
    !awaitingSignals &&
    catalogStatus !== 'loading' &&
    catalogStatus !== 'error' &&
    orderedEntries.length === 0 &&
    inProgress.length === 0;

  return (
    <section id="arcade" className="arcade-section">
      <div className="arcade-header">
        <div className="arcade-title-row">
          <h2 className="arcade-title">{t('catalog.title')}</h2>
          {liveCount > 0 ? (
            <span className="status-live catalog-live-count">
              <span className="live-dot" aria-hidden="true" />
              {t('myGames.liveCount', { count: liveCount })}
            </span>
          ) : null}
          {onOpenStudio && (hasBuilds || mySlugs.size > 0) ? (
            <button type="button" className="secondary-btn catalog-studio-btn" onClick={onOpenStudio}>
              <PixelIcon name="wrench" size={12} /> {t('myGames.openStudio')}
            </button>
          ) : null}
        </div>
        {showControls ? (
          <div className="catalog-toolbar" role="group" aria-label={t('catalog.toolbarLabel')}>
            {hasCatalog && canFilterYourGames ? (
              <button
                type="button"
                className={`catalog-filter-trigger${yourGamesOnly ? ' is-active' : ''}`}
                aria-pressed={yourGamesOnly}
                onClick={() => toggleFilter('your_games')}
              >
                {t('catalog.filter.your_games')}
              </button>
            ) : null}
            {hasCatalog ? (
              <button
                type="button"
                className={`catalog-filter-trigger${notPlayedOnly ? ' is-active' : ''}`}
                aria-pressed={notPlayedOnly}
                onClick={() => toggleFilter('not_played')}
              >
                {t('catalog.filter.not_played')}
              </button>
            ) : null}
            {hasCatalog ? (
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
            ) : null}
          </div>
        ) : null}
      </div>

      {catalogStatus === 'ready' && catalogError ? (
        <div className="catalog-refresh-error" role="status">
          <p className="catalog-refresh-error__text">{t('catalog.refreshError', { message: catalogError })}</p>
          <button type="button" className="secondary-btn catalog-refresh-error__retry" onClick={onRetryCatalog}>
            <PixelIcon name="undo" size={13} /> {t('catalog.retry')}
          </button>
        </div>
      ) : null}

      {catalogStatus === 'loading' || awaitingSignals ? (
        <MascotMoment className="catalog-state" emotion="busy" size={56} title={t('mascot.busyAlt')}>
          <p>{t('catalog.loading')}</p>
        </MascotMoment>
      ) : catalogStatus === 'error' && inProgress.length === 0 ? (
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
          {filtersActive && (catalogEntries.length > 0 || mySlugs.size > 0 || hasBuilds) ? (
            <button type="button" className="secondary-btn" onClick={clearFilters}>
              {t('catalog.clearFilters')}
            </button>
          ) : null}
        </MascotMoment>
      ) : (
        <div className="catalog-grid">
          {onOpenStatus
            ? inProgress.map((item) => <InProgressCard key={item.token} item={item} onOpen={onOpenStatus} />)
            : null}
          {orderedEntries.map((entry) => (
            <CatalogCard
              key={entry.slug}
              entry={entry}
              isYours={mySlugs.has(entry.slug)}
              onPlayGame={onPlayGame}
              onPlayTogether={onPlayTogether}
            />
          ))}
        </div>
      )}
    </section>
  );
}
