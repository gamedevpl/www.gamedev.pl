import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../../AuthContext.js';
import {
  catalogMediaUrl,
  defaultScreenshotIndex,
  gamePageHandle,
  isPlatformAuthor,
  type CatalogEntry,
} from '../../catalog.js';
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
import { creatorPath, gamePath } from '../../core/router.js';
import {
  fetchCatalogSortSignals,
  readCachedCatalogSortPayload,
  type CatalogSortPayload,
} from '../../recommendationsApi.js';
import { useInView } from '../../useInView.js';
import { isCatalogScrolling, watchCatalogScrollIdle, whenCatalogScrollIdle } from './catalogScrollIdle.js';
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

function humanizeMoment(name: string): string {
  return name
    .split('-')
    .map((word) => `${word.charAt(0).toUpperCase()}${word.slice(1)}`)
    .join(' ');
}

/** Hover must dwell this long before we fetch moments / arm video — scroll sweeps skip it. */
const HOVER_INTENT_MS = 240;

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
  const hoverTimerRef = useRef<number | null>(null);
  const hoveringRef = useRef(false);
  const cancelIdleWaitRef = useRef<(() => void) | null>(null);
  // Poster when near the fold; video/moments only after deliberate engage (dwell hover,
  // keyboard focus, or play). Leave-view unloads so scrolled-away cards stay light.
  const { ref: mediaRef, inView } = useInView<HTMLDivElement>({ rootMargin: '80px 0px', once: false });
  const screenshots = entry.media?.screenshots ?? [];
  const [selectedScreenshot, setSelectedScreenshot] = useState(() => defaultScreenshotIndex(screenshots));
  const [isPreviewPlaying, setIsPreviewPlaying] = useState(false);
  const [isPreviewPinned, setIsPreviewPinned] = useState(false);
  const [videoArmed, setVideoArmed] = useState(false);
  const [extrasOpen, setExtrasOpen] = useState(false);
  const selected = screenshots[selectedScreenshot] ?? screenshots[0];
  // 640 rather than the original: the card box is a few hundred CSS pixels, so this is
  // roughly 2x what is drawn and a fraction of a full screenshot to decode.
  const posterUrl = selected && inView ? catalogMediaUrl(entry.slug, selected.file, 640) : undefined;
  const hasVideo = Boolean(entry.media?.video);
  const hasMoments = screenshots.length > 1;
  const videoUrl =
    hasVideo && inView && videoArmed && entry.media?.video ? catalogMediaUrl(entry.slug, entry.media.video) : null;
  const showMoments = extrasOpen && inView && hasMoments;

  useEffect(() => {
    if (inView) return;
    hoveringRef.current = false;
    if (hoverTimerRef.current != null) {
      window.clearTimeout(hoverTimerRef.current);
      hoverTimerRef.current = null;
    }
    cancelIdleWaitRef.current?.();
    cancelIdleWaitRef.current = null;
    setExtrasOpen(false);
    setVideoArmed(false);
    setIsPreviewPlaying(false);
    setIsPreviewPinned(false);
  }, [inView]);

  useEffect(() => {
    if (!videoUrl) return;
    const video = videoRef.current;
    if (!video) return;
    try {
      void Promise.resolve(video.play()).then(
        () => setIsPreviewPlaying(true),
        () => setIsPreviewPlaying(false),
      );
    } catch {
      setIsPreviewPlaying(false);
    }
  }, [videoUrl]);

  useEffect(
    () => () => {
      hoveringRef.current = false;
      if (hoverTimerRef.current != null) window.clearTimeout(hoverTimerRef.current);
      cancelIdleWaitRef.current?.();
      cancelIdleWaitRef.current = null;
    },
    [],
  );

  function armPreview() {
    setVideoArmed(true);
    const video = videoRef.current;
    if (!video?.src) return;
    try {
      void Promise.resolve(video.play()).then(
        () => setIsPreviewPlaying(true),
        () => setIsPreviewPlaying(false),
      );
    } catch {
      setIsPreviewPlaying(false);
    }
  }

  function stopPreview() {
    const video = videoRef.current;
    if (video) {
      video.pause();
      video.removeAttribute('src');
      video.load();
    }
    setVideoArmed(false);
    setIsPreviewPlaying(false);
  }

  function pausePreview() {
    const video = videoRef.current;
    if (video) video.pause();
    setIsPreviewPlaying(false);
  }

  function clearHoverIntent() {
    if (hoverTimerRef.current != null) {
      window.clearTimeout(hoverTimerRef.current);
      hoverTimerRef.current = null;
    }
    cancelIdleWaitRef.current?.();
    cancelIdleWaitRef.current = null;
  }

  /** Open moments (and arm video when present) once the pointer is idle over the card. */
  function armExtrasFromHover() {
    if (!hoveringRef.current) return;
    if (isCatalogScrolling()) {
      // Inertial scroll can leave the cursor parked on the same card — wait for idle
      // instead of discarding the intent until the user re-enters.
      cancelIdleWaitRef.current?.();
      cancelIdleWaitRef.current = whenCatalogScrollIdle(() => {
        cancelIdleWaitRef.current = null;
        armExtrasFromHover();
      });
      return;
    }
    setExtrasOpen(true);
    if (hasVideo) armPreview();
  }

  function scheduleHoverIntent() {
    clearHoverIntent();
    hoveringRef.current = true;
    hoverTimerRef.current = window.setTimeout(() => {
      hoverTimerRef.current = null;
      armExtrasFromHover();
    }, HOVER_INTENT_MS);
  }

  function endHoverIntent() {
    hoveringRef.current = false;
    clearHoverIntent();
    if (isPreviewPinned) return;
    setExtrasOpen(false);
    stopPreview();
  }

  function togglePreview() {
    hoveringRef.current = false;
    clearHoverIntent();
    if (isPreviewPlaying) {
      setIsPreviewPinned(false);
      pausePreview();
    } else {
      setExtrasOpen(true);
      setIsPreviewPinned(true);
      armPreview();
    }
  }

  /** Video-less cards have no play toggle — pin/unpin the moment strip explicitly. */
  function toggleMoments() {
    hoveringRef.current = false;
    clearHoverIntent();
    if (extrasOpen) {
      setIsPreviewPinned(false);
      setExtrasOpen(false);
    } else {
      setExtrasOpen(true);
      setIsPreviewPinned(true);
    }
  }

  function selectScreenshot(index: number) {
    setSelectedScreenshot(index);
    setIsPreviewPinned(false);
    stopPreview();
  }

  return (
    <article className="catalog-card">
      <div
        ref={mediaRef}
        className="catalog-media"
        tabIndex={hasVideo || hasMoments ? 0 : undefined}
        onPointerEnter={(event) => {
          if (event.pointerType === 'mouse') scheduleHoverIntent();
        }}
        onPointerLeave={(event) => {
          if (event.pointerType === 'mouse') endHoverIntent();
        }}
        onFocus={(event) => {
          if (event.target !== event.currentTarget) return;
          setExtrasOpen(true);
          if (hasVideo) armPreview();
        }}
        onBlur={(event) => {
          if (event.currentTarget.contains(event.relatedTarget)) return;
          hoveringRef.current = false;
          clearHoverIntent();
          setIsPreviewPinned(false);
          setExtrasOpen(false);
          stopPreview();
        }}
      >
        <a
          className="catalog-card-hit-area"
          href={gamePath(gamePageHandle(entry), entry.slug)}
          aria-label={`${entry.title} — ${t('catalog.openGame')}`}
        />
        {videoUrl ? (
          <video
            ref={videoRef}
            className="catalog-preview"
            src={videoUrl}
            poster={posterUrl}
            muted
            loop
            playsInline
            preload="auto"
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
              className="preview-toggle preview-toggle--video"
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

          {/* Cards without a trailer still need a deliberate, accessible way to open
              the moment strip — hover dwell is mouse-only and media focus is easy to
              miss on touch. Reuse the preview-toggle chrome so the badge column stays
              one shape. */}
          {!hasVideo && hasMoments && (
            <button
              type="button"
              className="preview-toggle"
              aria-pressed={extrasOpen}
              aria-label={extrasOpen ? t('catalog.hideMoments') : t('catalog.showMoments')}
              disabled={!inView}
              onClick={toggleMoments}
            >
              <PixelIcon name="image" size={11} />
              <span className="btn-label">{extrasOpen ? t('catalog.hideMoments') : t('catalog.showMoments')}</span>
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

          {isYours ? (
            <span className="yours-pill" title={t('catalog.yoursBadge')}>
              <PixelIcon name="user" size={10} /> {t('catalog.yoursBadge')}
            </span>
          ) : null}
        </div>

        <span className="genre-pill">{entry.genre}</span>

        {showMoments && (
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
                <img src={catalogMediaUrl(entry.slug, screenshot.file, 96)} alt="" loading="lazy" decoding="async" />
              </button>
            ))}
          </div>
        )}

        {/* Title, one-line control hint and the Play CTA sit on top of the preview over
            a bottom scrim, so the card is just the media box — no separate content
            row underneath. Saves ~90px of height per card without dropping any info. */}
        <div className="catalog-overlay">
          <div className="card-copy">
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
              {entry.editor === 'content' && (
                <span className="card-party-badge" title={t('catalog.editorTooltip')}>
                  <PixelIcon name="pencil" size={12} /> {t('catalog.editorBadge')}
                </span>
              )}
              {/* Advisory, like saves: says the game answers tilt where the device offers
                it, while the keyboard stays the whole game everywhere else. Reuses the
                party pill style — it is the same "how you can drive this" family. */}
              {entry.sensing === 'tilt' && (
                <span className="card-party-badge" title={t('catalog.tiltTooltip')}>
                  <PixelIcon name="phone" size={12} /> {t('catalog.tiltBadge')}
                </span>
              )}
              {entry.sensing === 'backdrop' && (
                <span className="card-party-badge" title={t('catalog.cameraTooltip')}>
                  <PixelIcon name="phone" size={12} /> {t('catalog.cameraBadge')}
                </span>
              )}
            </h3>
            <p className="card-author">
              {entry.creatorHandle && !isPlatformAuthor(entry.submittedBy) ? (
                <>
                  {t('player.byAuthorPrefix')}
                  <a className="card-author-link" href={creatorPath(entry.creatorHandle)}>
                    {entry.submittedBy}
                  </a>
                </>
              ) : (
                t('player.byAuthor', {
                  author: isPlatformAuthor(entry.submittedBy) ? t('catalog.platformAuthor') : entry.submittedBy,
                })
              )}
            </p>
            {/*
             * Contributor credit — the growth loop, and the reason proposing is worth doing.
             * Its own line rather than appended to the byline: the owner is who made the
             * game, and a contributor sharing that sentence would blur authorship the
             * ownership rules are careful to keep clear.
             */}
            {entry.contributorHandles && entry.contributorHandles.length > 0 ? (
              <p className="card-contributors">
                {t('catalog.withContributions')}{' '}
                {entry.contributorHandles.map((handle, index) => (
                  <span key={handle}>
                    {index > 0 ? ', ' : null}
                    <a className="card-author-link" href={creatorPath(handle)}>
                      @{handle}
                    </a>
                  </span>
                ))}
              </p>
            ) : null}
          </div>
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
