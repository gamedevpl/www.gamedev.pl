import { useEffect, useId, useMemo, useRef, useState, type RefObject } from 'react';
import { useTranslation } from 'react-i18next';
import { useAuth } from './AuthContext.js';
import { AuthModal } from './AuthModal.js';
import type { GameHealth } from './healthApi.js';
import { PixelIcon, type PixelIconName } from './PixelIcon.js';
import { formatRelativeTime } from './relativeTime.js';
import { studioPath } from './router.js';
import { abandonSubmission, submitFeedback, type SubmissionApiError, type SubmissionState } from './submissionApi.js';
import { StudioPlaytestPanel } from './StudioPlaytestPanel.js';
import {
  filterStudioGames,
  isStudioGamePublished,
  STUDIO_LIVE_STATUSES,
  STUDIO_SHELF_TOOLS_AT,
  type StudioShelfFilter,
} from './studioShelf.js';
import { SubmissionStatusView } from './SubmissionStatusView.js';
import {
  fetchStudioGames,
  fetchStudioHealth,
  submitImprovement,
  type StudioApiError,
  type StudioGame,
} from './studioApi.js';

/**
 * Creator control panel (docs/improvement-loop-plan.md IL-2 creator surface).
 *
 * One place for the whole creator loop: shelf of owned games, the draft Build
 * (former status / "dev studio" page), playtest-with-pause prompting, play
 * health, and post-publish improve. Player-feedback analysis is stubbed.
 *
 * Shelf scales past a handful of games: compact rows, search/filter once the
 * list grows, and on narrow viewports a game switcher (picker sheet) so the
 * work surface is not buried under ten cards.
 */

const STATUS_ICONS: Record<SubmissionState, PixelIconName> = {
  queued: 'clock',
  building: 'wrench',
  in_review: 'eye',
  publishing: 'rocket',
  published: 'star',
  needs_changes: 'pencil',
  abandoned: 'trash',
};

const WINDOWS = [1, 7, 30];

type StudioTab = 'overview' | 'build' | 'playtest' | 'stats' | 'improve' | 'feedback';

type CreatorStudioViewProps = {
  /** Deep-link into a specific game when present. */
  selectedToken?: string;
  onNavigate: (path: string) => void;
  onPlay: (slug: string) => void;
  /** Loads a failed/abandoned concept back into the home hero prompt. */
  onRetryConcept?: (concept: string) => void;
};

function defaultTabFor(game: StudioGame | null): StudioTab {
  if (!game) return 'overview';
  return isStudioGamePublished(game) ? 'overview' : 'build';
}

function formatSeconds(seconds: number): string {
  if (seconds < 60) return `${Math.round(seconds)}s`;
  const minutes = Math.floor(seconds / 60);
  const rest = Math.round(seconds % 60);
  return rest === 0 ? `${minutes}m` : `${minutes}m ${rest}s`;
}

function percent(rate: number): string {
  return `${Math.round(rate * 100)}%`;
}

function healthFor(game: StudioGame, rows: GameHealth[]): GameHealth | null {
  if (!game.slug) return null;
  return rows.find((row) => row.slug === game.slug) ?? null;
}

export function CreatorStudioView({ selectedToken, onNavigate, onPlay, onRetryConcept }: CreatorStudioViewProps) {
  const { t, i18n } = useTranslation();
  const { user } = useAuth();
  const [authOpen, setAuthOpen] = useState(false);
  const [games, setGames] = useState<StudioGame[]>([]);
  const [healthRows, setHealthRows] = useState<GameHealth[]>([]);
  const [healthDays, setHealthDays] = useState<string[]>([]);
  const [truncated, setTruncated] = useState(false);
  const [days, setDays] = useState(7);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<string | null>(selectedToken ?? null);
  const [tab, setTab] = useState<StudioTab>('overview');
  const [shelfQuery, setShelfQuery] = useState('');
  const [shelfFilter, setShelfFilter] = useState<StudioShelfFilter>('all');
  const [pickerOpen, setPickerOpen] = useState(false);
  const shelfSearchId = useId();
  const pickerSearchId = useId();
  const pickerSearchRef = useRef<HTMLInputElement>(null!);

  useEffect(() => {
    if (selectedToken) setSelected(selectedToken);
  }, [selectedToken]);

  useEffect(() => {
    if (!user) {
      setGames([]);
      setHealthRows([]);
      setLoading(false);
      return;
    }

    let cancelled = false;
    setLoading(true);
    setError(null);

    Promise.all([fetchStudioGames(), fetchStudioHealth(days)])
      .then(([shelf, health]) => {
        if (cancelled) return;
        setGames(shelf);
        setHealthRows(health.games);
        setHealthDays(health.days);
        setTruncated(health.truncated);
        setLoading(false);
        setSelected((current) => {
          if (current && shelf.some((game) => game.token === current)) return current;
          return shelf[0]?.token ?? null;
        });
      })
      .catch(() => {
        if (!cancelled) {
          setError(t('studioPanel.loadError'));
          setLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [user, days, t]);

  const selectedGame = useMemo(() => games.find((game) => game.token === selected) ?? null, [games, selected]);
  const selectedHealth = selectedGame ? healthFor(selectedGame, healthRows) : null;
  const visibleGames = useMemo(
    () => filterStudioGames(games, { filter: shelfFilter, query: shelfQuery }),
    [games, shelfFilter, shelfQuery],
  );
  const showShelfTools = games.length >= STUDIO_SHELF_TOOLS_AT;
  const buildingCount = useMemo(
    () => games.filter((game) => game.lastKnownStatus && STUDIO_LIVE_STATUSES.has(game.lastKnownStatus)).length,
    [games],
  );
  const liveCount = useMemo(() => games.filter((game) => isStudioGamePublished(game)).length, [games]);

  useEffect(() => {
    if (selectedGame) {
      setTab((current) => {
        // Keep the user on a tab that still exists for this game.
        if (current === 'build' && isStudioGamePublished(selectedGame)) return 'overview';
        if (current === 'stats' && !isStudioGamePublished(selectedGame)) return 'build';
        if (current === 'feedback' && !isStudioGamePublished(selectedGame)) return 'improve';
        return current;
      });
    }
  }, [selectedGame]);

  useEffect(() => {
    if (!pickerOpen) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const frame = window.requestAnimationFrame(() => pickerSearchRef.current?.focus());
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setPickerOpen(false);
    };
    window.addEventListener('keydown', onKey);
    return () => {
      document.body.style.overflow = previous;
      window.cancelAnimationFrame(frame);
      window.removeEventListener('keydown', onKey);
    };
  }, [pickerOpen]);

  function selectGame(token: string) {
    const next = games.find((game) => game.token === token) ?? null;
    setSelected(token);
    setTab(defaultTabFor(next));
    setPickerOpen(false);
    onNavigate(studioPath(token));
  }

  if (!user) {
    return (
      <section className="studio-panel">
        <header className="studio-panel-header">
          <div>
            <h1 className="section-title">{t('studioPanel.title')}</h1>
            <p className="panel-copy">{t('studioPanel.signInHint')}</p>
          </div>
          <button type="button" className="primary-btn" onClick={() => setAuthOpen(true)}>
            <PixelIcon name="user" size={14} /> {t('header.signIn')}
          </button>
        </header>
        <AuthModal isOpen={authOpen} onClose={() => setAuthOpen(false)} />
      </section>
    );
  }

  const shelfList = (
    <StudioShelfList
      games={visibleGames}
      selected={selected}
      locale={i18n.language}
      emptyLabel={t('studioPanel.shelf.noMatches')}
      onSelect={selectGame}
    />
  );

  return (
    <section className="studio-panel">
      <header className="studio-panel-header">
        <div>
          <h1 className="section-title">{t('studioPanel.title')}</h1>
          <p className="panel-copy">{t('studioPanel.subtitle')}</p>
        </div>
        <button type="button" className="secondary-btn" onClick={() => onNavigate('/')}>
          {t('studioPanel.backHome')}
        </button>
      </header>

      {loading ? <p className="studio-empty">{t('studioPanel.loading')}</p> : null}
      {error ? <p className="studio-empty studio-error">{error}</p> : null}

      {!loading && !error && games.length === 0 ? (
        <div className="studio-empty-state">
          <p>{t('studioPanel.empty')}</p>
          <button type="button" className="primary-btn" onClick={() => onNavigate('/')}>
            <PixelIcon name="sparkle" size={14} /> {t('studioPanel.createFirst')}
          </button>
        </div>
      ) : null}

      {!loading && games.length > 0 ? (
        <div className={`studio-layout${selectedGame ? ' is-game-open' : ''}`}>
          <aside className="studio-shelf" aria-label={t('studioPanel.shelfAria')}>
            <div className="studio-shelf-head">
              <h2 className="studio-shelf-heading">{t('studioPanel.shelf.heading')}</h2>
              <span className="studio-shelf-count">{t('studioPanel.shelf.count', { count: games.length })}</span>
            </div>
            <StudioShelfControls
              searchInputId={shelfSearchId}
              query={shelfQuery}
              filter={shelfFilter}
              showTools={showShelfTools}
              buildingCount={buildingCount}
              liveCount={liveCount}
              totalCount={games.length}
              onQueryChange={setShelfQuery}
              onFilterChange={setShelfFilter}
            />
            {shelfList}
          </aside>

          {selectedGame ? (
            <div className="studio-detail">
              <div className="studio-detail-head">
                <button
                  type="button"
                  className="studio-game-switcher"
                  onClick={() => setPickerOpen(true)}
                  aria-haspopup="dialog"
                  aria-expanded={pickerOpen}
                >
                  <span className="studio-game-switcher-label">{t('studioPanel.shelf.switcher')}</span>
                  <span className="studio-game-switcher-title">{selectedGame.title}</span>
                  <PixelIcon name="expand" size={12} />
                </button>
                <div className="studio-detail-title-row">
                  <h2>{selectedGame.title}</h2>
                  {selectedGame.slug ? <code className="studio-slug">{selectedGame.slug}</code> : null}
                </div>
              </div>

              <div className="studio-tabs" role="tablist" aria-label={t('studioPanel.title')}>
                {(
                  [
                    ['overview', 'studioPanel.tabs.overview'],
                    ...(!isStudioGamePublished(selectedGame) ? ([['build', 'studioPanel.tabs.build']] as const) : []),
                    ['playtest', 'studioPanel.tabs.playtest'],
                    ...(isStudioGamePublished(selectedGame) ? ([['stats', 'studioPanel.tabs.stats']] as const) : []),
                    ['improve', 'studioPanel.tabs.improve'],
                    ...(isStudioGamePublished(selectedGame)
                      ? ([['feedback', 'studioPanel.tabs.feedback']] as const)
                      : []),
                  ] as const
                ).map(([id, labelKey]) => (
                  <button
                    key={id}
                    type="button"
                    role="tab"
                    aria-selected={tab === id}
                    className={`studio-tab${tab === id ? ' is-active' : ''}`}
                    onClick={() => setTab(id)}
                  >
                    {t(labelKey)}
                  </button>
                ))}
              </div>

              <div className="studio-tab-panel">
                {tab === 'overview' ? (
                  <OverviewTab
                    game={selectedGame}
                    health={selectedHealth}
                    onOpenBuild={() => setTab('build')}
                    onOpenPlaytest={() => setTab('playtest')}
                    onPlay={() => selectedGame.slug && onPlay(selectedGame.slug)}
                    onRemoved={(token) => {
                      setGames((prev) => prev.filter((game) => game.token !== token));
                      setSelected((current) => (current === token ? null : current));
                      onNavigate(studioPath());
                    }}
                  />
                ) : null}

                {tab === 'build' && !isStudioGamePublished(selectedGame) ? (
                  <div className="studio-build">
                    <SubmissionStatusView
                      token={selectedGame.token}
                      embedded
                      onRetry={
                        onRetryConcept
                          ? (concept) => {
                              onRetryConcept(concept);
                              onNavigate('/');
                            }
                          : undefined
                      }
                    />
                  </div>
                ) : null}

                {tab === 'playtest' ? (
                  <StudioPlaytestPanel game={selectedGame} published={isStudioGamePublished(selectedGame)} />
                ) : null}

                {tab === 'stats' ? (
                  <StatsTab
                    game={selectedGame}
                    health={selectedHealth}
                    days={days}
                    healthDays={healthDays}
                    truncated={truncated}
                    onDaysChange={setDays}
                  />
                ) : null}

                {tab === 'improve' ? <ImproveTab game={selectedGame} /> : null}

                {tab === 'feedback' ? (
                  <div className="studio-coming-soon">
                    <PixelIcon name="eye" size={18} />
                    <div>
                      <h3>{t('studioPanel.feedback.title')}</h3>
                      <p>{t('studioPanel.feedback.body')}</p>
                    </div>
                  </div>
                ) : null}
              </div>
            </div>
          ) : null}
        </div>
      ) : null}

      {pickerOpen ? (
        <div
          className="modal-backdrop studio-picker-backdrop"
          role="presentation"
          onClick={(event) => {
            if (event.target === event.currentTarget) setPickerOpen(false);
          }}
        >
          <div
            className="studio-picker"
            role="dialog"
            aria-modal="true"
            aria-label={t('studioPanel.shelf.pickerTitle')}
          >
            <header className="studio-picker-header">
              <div>
                <h2>{t('studioPanel.shelf.pickerTitle')}</h2>
                <p>{t('studioPanel.shelf.count', { count: games.length })}</p>
              </div>
              <button
                type="button"
                className="modal-close-btn"
                onClick={() => setPickerOpen(false)}
                aria-label={t('studioPanel.shelf.closePicker')}
              >
                <PixelIcon name="close" size={14} />
              </button>
            </header>
            <StudioShelfControls
              searchInputId={pickerSearchId}
              searchRef={pickerSearchRef}
              query={shelfQuery}
              filter={shelfFilter}
              showTools={showShelfTools || games.length > 1}
              buildingCount={buildingCount}
              liveCount={liveCount}
              totalCount={games.length}
              onQueryChange={setShelfQuery}
              onFilterChange={setShelfFilter}
            />
            {shelfList}
          </div>
        </div>
      ) : null}
    </section>
  );
}

function StudioShelfControls({
  searchInputId,
  searchRef,
  query,
  filter,
  showTools,
  buildingCount,
  liveCount,
  totalCount,
  onQueryChange,
  onFilterChange,
}: {
  searchInputId: string;
  searchRef?: RefObject<HTMLInputElement>;
  query: string;
  filter: StudioShelfFilter;
  showTools: boolean;
  buildingCount: number;
  liveCount: number;
  totalCount: number;
  onQueryChange: (value: string) => void;
  onFilterChange: (value: StudioShelfFilter) => void;
}) {
  const { t } = useTranslation();
  if (!showTools) return null;

  return (
    <div className="studio-shelf-tools">
      <label className="studio-shelf-search" htmlFor={searchInputId}>
        <PixelIcon name="search" size={12} />
        <span className="studio-sr-only">{t('studioPanel.shelf.searchLabel')}</span>
        <input
          id={searchInputId}
          ref={searchRef}
          type="search"
          value={query}
          onChange={(event) => onQueryChange(event.target.value)}
          placeholder={t('studioPanel.shelf.searchPlaceholder')}
          autoComplete="off"
        />
      </label>
      <div className="studio-shelf-filters" role="group" aria-label={t('studioPanel.shelf.filterAria')}>
        {(
          [
            ['all', t('studioPanel.shelf.filters.all'), totalCount],
            ['building', t('studioPanel.shelf.filters.building'), buildingCount],
            ['live', t('studioPanel.shelf.filters.live'), liveCount],
          ] as const
        ).map(([id, label, count]) => (
          <button
            key={id}
            type="button"
            className={`studio-shelf-filter${filter === id ? ' is-active' : ''}`}
            aria-pressed={filter === id}
            onClick={() => onFilterChange(id)}
          >
            {label}
            <span className="studio-shelf-filter-count">{count}</span>
          </button>
        ))}
      </div>
    </div>
  );
}

function StudioShelfList({
  games,
  selected,
  locale,
  emptyLabel,
  onSelect,
}: {
  games: StudioGame[];
  selected: string | null;
  locale: string;
  emptyLabel: string;
  onSelect: (token: string) => void;
}) {
  const { t } = useTranslation();

  if (games.length === 0) {
    return <p className="studio-shelf-empty">{emptyLabel}</p>;
  }

  return (
    <ul className="studio-shelf-list">
      {games.map((game) => {
        const active = game.token === selected;
        const status = game.lastKnownStatus;
        const building = Boolean(status && STUDIO_LIVE_STATUSES.has(status));
        const published = isStudioGamePublished(game);
        return (
          <li key={game.token}>
            <button
              type="button"
              className={`studio-shelf-item${active ? ' is-active' : ''}${building ? ' is-live' : ''}${published ? ' is-published' : ''}`}
              onClick={() => onSelect(game.token)}
              aria-current={active ? 'true' : undefined}
            >
              <span className={`studio-shelf-status${building ? ' is-live' : ''}${published ? ' is-published' : ''}`}>
                {status ? (
                  <>
                    <PixelIcon name={STATUS_ICONS[status]} size={11} /> {t(`statusView.states.${status}.label`)}
                  </>
                ) : (
                  t('myGames.checking')
                )}
              </span>
              <span className="studio-shelf-title">{game.title}</span>
              <span className="studio-shelf-meta">{formatRelativeTime(Date.parse(game.createdAt), locale)}</span>
            </button>
          </li>
        );
      })}
    </ul>
  );
}

function OverviewTab({
  game,
  health,
  onOpenBuild,
  onOpenPlaytest,
  onPlay,
  onRemoved,
}: {
  game: StudioGame;
  health: GameHealth | null;
  onOpenBuild: () => void;
  onOpenPlaytest: () => void;
  onPlay: () => void;
  onRemoved: (token: string) => void;
}) {
  const { t, i18n } = useTranslation();
  const published = isStudioGamePublished(game);
  const [abandonArmed, setAbandonArmed] = useState(false);
  const [abandoning, setAbandoning] = useState(false);

  async function handleAbandon() {
    if (!abandonArmed) {
      setAbandonArmed(true);
      return;
    }
    setAbandoning(true);
    try {
      await abandonSubmission(game.token);
      onRemoved(game.token);
    } catch {
      setAbandoning(false);
      setAbandonArmed(false);
    }
  }

  const statusLabel = game.lastKnownStatus
    ? t(`statusView.states.${game.lastKnownStatus}.label`)
    : t('myGames.checking');
  const live = game.lastKnownStatus ? STUDIO_LIVE_STATUSES.has(game.lastKnownStatus) : false;

  return (
    <div className="studio-overview">
      <div className="studio-overview-status">
        <span className={`status-play-badge${published || live ? ' is-live' : ''}`}>
          {(published || live) && <span className="live-dot" aria-hidden="true" />}
          {statusLabel}
        </span>
      </div>

      <ul className="funnel-stats studio-facts">
        <li>
          <span className="funnel-stat-value">{formatRelativeTime(Date.parse(game.createdAt), i18n.language)}</span>
          <span className="funnel-stat-label">{t('studioPanel.overview.created')}</span>
        </li>
        {game.publishedAt ? (
          <li>
            <span className="funnel-stat-value">{formatRelativeTime(Date.parse(game.publishedAt), i18n.language)}</span>
            <span className="funnel-stat-label">{t('studioPanel.overview.published')}</span>
          </li>
        ) : null}
        {health ? (
          <li>
            <span className="funnel-stat-value">
              {health.sessions}
              <span className="studio-fact-suffix">
                · {formatSeconds(health.totalPlaySeconds)} {t('studioPanel.overview.play')}
              </span>
            </span>
            <span className="funnel-stat-label">{t('studioPanel.overview.sessions')}</span>
          </li>
        ) : null}
      </ul>

      <div className="studio-actions">
        {published && game.slug ? (
          <button type="button" className="primary-btn" onClick={onPlay}>
            <PixelIcon name="play" size={12} /> {t('myGames.play')}
          </button>
        ) : (
          <button type="button" className="primary-btn" onClick={onOpenBuild}>
            <PixelIcon name="wrench" size={12} /> {t('studioPanel.overview.openBuild')}
          </button>
        )}
        <button type="button" className="secondary-btn" onClick={onOpenPlaytest}>
          <PixelIcon name="play" size={12} /> {t('studioPanel.overview.playtest')}
        </button>
        {!published && game.lastKnownStatus !== 'abandoned' ? (
          <button
            type="button"
            className={`status-abandon${abandonArmed ? ' is-danger' : ''}`}
            onClick={() => void handleAbandon()}
            disabled={abandoning}
          >
            {abandonArmed ? t('studioPanel.overview.abandonConfirm') : t('studioPanel.overview.abandon')}
          </button>
        ) : null}
      </div>
    </div>
  );
}

function StatsTab({
  game,
  health,
  days,
  healthDays,
  truncated,
  onDaysChange,
}: {
  game: StudioGame;
  health: GameHealth | null;
  days: number;
  healthDays: string[];
  truncated: boolean;
  onDaysChange: (days: number) => void;
}) {
  const { t } = useTranslation();

  if (!game.slug) {
    return <p className="studio-empty">{t('studioPanel.stats.noSlug')}</p>;
  }

  return (
    <div className="studio-stats">
      <div className="health-windows">
        {WINDOWS.map((window) => (
          <button
            key={window}
            type="button"
            className={window === days ? 'health-window is-active' : 'health-window'}
            onClick={() => onDaysChange(window)}
          >
            {window}d
          </button>
        ))}
      </div>

      {healthDays.length > 0 ? (
        <p className="studio-stats-range">
          {t('studioPanel.stats.range', { from: healthDays[healthDays.length - 1], to: healthDays[0] })}
        </p>
      ) : null}
      {truncated ? <p className="health-note">{t('studioPanel.stats.truncated')}</p> : null}

      {!health || health.sessions === 0 ? (
        <p className="studio-empty">{t('studioPanel.stats.empty')}</p>
      ) : (
        <ul className="funnel-stats">
          <li>
            <span className="funnel-stat-value">{health.sessions}</span>
            <span className="funnel-stat-label">{t('studioPanel.stats.sessions')}</span>
          </li>
          <li>
            <span className="funnel-stat-value">
              {health.bounces} ({percent(health.sessions === 0 ? 0 : health.bounces / health.sessions)})
            </span>
            <span className="funnel-stat-label">{t('studioPanel.stats.bounces')}</span>
          </li>
          <li>
            <span className="funnel-stat-value">{formatSeconds(health.medianPlaySeconds)}</span>
            <span className="funnel-stat-label">{t('studioPanel.stats.medianPlay')}</span>
          </li>
          <li>
            <span className="funnel-stat-value">{formatSeconds(health.totalPlaySeconds)}</span>
            <span className="funnel-stat-label">{t('studioPanel.stats.totalPlay')}</span>
          </li>
          <li>
            <span className="funnel-stat-value">{health.errors}</span>
            <span className="funnel-stat-label">{t('studioPanel.stats.errors')}</span>
          </li>
          <li>
            <span className="funnel-stat-value">{percent(health.stallRate)}</span>
            <span className="funnel-stat-label">{t('studioPanel.stats.stallRate')}</span>
          </li>
          <li>
            <span className="funnel-stat-value">{health.medianFps === null ? '—' : Math.round(health.medianFps)}</span>
            <span className="funnel-stat-label">{t('studioPanel.stats.medianFps')}</span>
          </li>
        </ul>
      )}

      {health && health.errorSamples.length > 0 ? (
        <div className="studio-error-samples">
          <h3 className="health-section-title">{t('studioPanel.stats.errorSamples')}</h3>
          <ul>
            {health.errorSamples.map((sample) => (
              <li key={sample.message}>
                <code>{sample.message}</code>
                <span className="health-error-count">×{sample.count}</span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
}

function ImproveTab({ game }: { game: StudioGame }) {
  const { t } = useTranslation();
  const published = isStudioGamePublished(game);
  const [text, setText] = useState('');
  const [state, setState] = useState<'idle' | 'sending' | 'sent'>('idle');
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit() {
    const trimmed = text.trim();
    if (trimmed.length < 10 || state === 'sending') return;
    setState('sending');
    setError(null);
    try {
      if (published) {
        await submitImprovement(game.token, trimmed);
      } else {
        await submitFeedback(game.token, trimmed);
      }
      setText('');
      setState('sent');
    } catch (err) {
      const apiErr = err as StudioApiError | SubmissionApiError;
      const message = apiErr.message ?? '';
      if (message.includes('quota')) {
        setError(t('studioPanel.improve.quota'));
      } else if (apiErr.status === 429 || message.includes('too many')) {
        setError(t('studioPanel.improve.rateLimit'));
      } else if (apiErr.status === 422) {
        setError(t('studioPanel.improve.rejected'));
      } else {
        setError(t('studioPanel.improve.error'));
      }
      setState('idle');
    }
  }

  return (
    <div className="status-feedback studio-improve">
      <h3 className="status-feedback-title">
        {published ? t('studioPanel.improve.titlePublished') : t('studioPanel.improve.titleDraft')}
      </h3>
      <p className="status-feedback-hint">
        {published ? t('studioPanel.improve.hintPublished') : t('studioPanel.improve.hintDraft')}
      </p>
      <textarea
        className="status-feedback-input"
        rows={5}
        value={text}
        onChange={(event) => {
          setText(event.target.value);
          if (state === 'sent') setState('idle');
        }}
        placeholder={t('studioPanel.improve.placeholder')}
        disabled={state === 'sending'}
      />
      <div className="status-feedback-actions">
        <button
          type="button"
          className="primary-btn"
          disabled={text.trim().length < 10 || state === 'sending'}
          onClick={() => void handleSubmit()}
        >
          {state === 'sending' ? t('studioPanel.improve.sending') : t('studioPanel.improve.submit')}
        </button>
        {state === 'sent' ? (
          <span className="status-feedback-sent">
            <PixelIcon name="check" size={13} /> {t('studioPanel.improve.sent')}
          </span>
        ) : null}
      </div>
      {error ? <p className="error">{error}</p> : null}
    </div>
  );
}
