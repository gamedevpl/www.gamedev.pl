import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useAuth } from './AuthContext';
import { AuthModal } from './AuthModal';
import type { GameHealth } from './healthApi';
import { PixelIcon, type PixelIconName } from './PixelIcon';
import { formatRelativeTime } from './relativeTime';
import { studioPath } from './router';
import {
  abandonSubmission,
  submitFeedback,
  type SubmissionApiError,
  type SubmissionState,
} from './submissionApi';
import { StudioPlaytestPanel } from './StudioPlaytestPanel';
import { SubmissionStatusView } from './SubmissionStatusView';
import {
  fetchStudioGames,
  fetchStudioHealth,
  submitImprovement,
  type StudioApiError,
  type StudioGame,
} from './studioApi';

/**
 * Creator control panel (docs/improvement-loop-plan.md IL-2 creator surface).
 *
 * One place for the whole creator loop: shelf of owned games, the draft Build
 * (former status / "dev studio" page), playtest-with-pause prompting, play
 * health, and post-publish improve. Player-feedback analysis is stubbed.
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
  return isPublished(game) ? 'overview' : 'build';
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

function isPublished(game: StudioGame): boolean {
  return Boolean(game.publishedAt && game.slug) || game.lastKnownStatus === 'published';
}

export function CreatorStudioView({
  selectedToken,
  onNavigate,
  onPlay,
  onRetryConcept,
}: CreatorStudioViewProps) {
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

  const selectedGame = useMemo(
    () => games.find((game) => game.token === selected) ?? null,
    [games, selected],
  );
  const selectedHealth = selectedGame ? healthFor(selectedGame, healthRows) : null;

  useEffect(() => {
    if (selectedGame) {
      setTab((current) => {
        // Keep the user on a tab that still exists for this game.
        if (current === 'build' && isPublished(selectedGame)) return 'overview';
        if (current === 'stats' && !isPublished(selectedGame)) return 'build';
        if (current === 'feedback' && !isPublished(selectedGame)) return 'improve';
        return current;
      });
    }
  }, [selectedGame]);

  function selectGame(token: string) {
    const next = games.find((game) => game.token === token) ?? null;
    setSelected(token);
    setTab(defaultTabFor(next));
    onNavigate(studioPath(token));
  }

  if (!user) {
    return (
      <section className="studio-panel">
        <header className="studio-panel-header">
          <h1>{t('studioPanel.title')}</h1>
          <p>{t('studioPanel.signInHint')}</p>
          <button type="button" className="primary-btn" onClick={() => setAuthOpen(true)}>
            <PixelIcon name="user" size={14} /> {t('header.signIn')}
          </button>
        </header>
        <AuthModal isOpen={authOpen} onClose={() => setAuthOpen(false)} />
      </section>
    );
  }

  return (
    <section className="studio-panel">
      <header className="studio-panel-header">
        <div>
          <h1>{t('studioPanel.title')}</h1>
          <p>{t('studioPanel.subtitle')}</p>
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
        <div className="studio-layout">
          <aside className="studio-shelf" aria-label={t('studioPanel.shelfAria')}>
            <ul className="studio-shelf-list">
              {games.map((game) => {
                const active = game.token === selected;
                const status = game.lastKnownStatus;
                return (
                  <li key={game.token}>
                    <button
                      type="button"
                      className={`studio-shelf-item${active ? ' is-active' : ''}`}
                      onClick={() => selectGame(game.token)}
                      aria-current={active ? 'true' : undefined}
                    >
                      <span className="studio-shelf-title">{game.title}</span>
                      <span className="studio-shelf-meta">
                        {status ? (
                          <>
                            <PixelIcon name={STATUS_ICONS[status]} size={11} />{' '}
                            {t(`statusView.states.${status}.label`)}
                          </>
                        ) : (
                          t('myGames.checking')
                        )}
                        <span aria-hidden="true"> · </span>
                        {formatRelativeTime(Date.parse(game.createdAt), i18n.language)}
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          </aside>

          {selectedGame ? (
            <div className="studio-detail">
              <div className="studio-detail-head">
                <h2>{selectedGame.title}</h2>
                {selectedGame.slug ? (
                  <code className="studio-slug">{selectedGame.slug}</code>
                ) : null}
              </div>

              <div className="studio-tabs" role="tablist">
                {(
                  [
                    ['overview', 'studioPanel.tabs.overview'],
                    ...(!isPublished(selectedGame)
                      ? ([['build', 'studioPanel.tabs.build']] as const)
                      : []),
                    ['playtest', 'studioPanel.tabs.playtest'],
                    ...(isPublished(selectedGame)
                      ? ([['stats', 'studioPanel.tabs.stats']] as const)
                      : []),
                    ['improve', 'studioPanel.tabs.improve'],
                    ...(isPublished(selectedGame)
                      ? ([['feedback', 'studioPanel.tabs.feedback']] as const)
                      : []),
                  ] as const
                ).map(([id, labelKey]) => (
                  <button
                    key={id}
                    type="button"
                    role="tab"
                    aria-selected={tab === id}
                    className={`tab-btn${tab === id ? ' active' : ''}`}
                    onClick={() => setTab(id)}
                  >
                    {t(labelKey)}
                  </button>
                ))}
              </div>

              <div className="tab-content">
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

                {tab === 'build' && !isPublished(selectedGame) ? (
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
                  <StudioPlaytestPanel game={selectedGame} published={isPublished(selectedGame)} />
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
                    <h3>{t('studioPanel.feedback.title')}</h3>
                    <p>{t('studioPanel.feedback.body')}</p>
                  </div>
                ) : null}
              </div>
            </div>
          ) : null}
        </div>
      ) : null}
    </section>
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
  const published = isPublished(game);
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

  return (
    <div className="studio-overview">
      <dl className="studio-facts">
        <div>
          <dt>{t('studioPanel.overview.status')}</dt>
          <dd>
            {game.lastKnownStatus
              ? t(`statusView.states.${game.lastKnownStatus}.label`)
              : t('myGames.checking')}
          </dd>
        </div>
        <div>
          <dt>{t('studioPanel.overview.created')}</dt>
          <dd>{formatRelativeTime(Date.parse(game.createdAt), i18n.language)}</dd>
        </div>
        {game.publishedAt ? (
          <div>
            <dt>{t('studioPanel.overview.published')}</dt>
            <dd>{formatRelativeTime(Date.parse(game.publishedAt), i18n.language)}</dd>
          </div>
        ) : null}
        {health ? (
          <div>
            <dt>{t('studioPanel.overview.sessions')}</dt>
            <dd>
              {health.sessions} · {formatSeconds(health.totalPlaySeconds)} {t('studioPanel.overview.play')}
            </dd>
          </div>
        ) : null}
      </dl>

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
            className="ghost-btn"
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
        <dl className="studio-stat-grid">
          <div>
            <dt>{t('studioPanel.stats.sessions')}</dt>
            <dd>{health.sessions}</dd>
          </div>
          <div>
            <dt>{t('studioPanel.stats.bounces')}</dt>
            <dd>
              {health.bounces} ({percent(health.sessions === 0 ? 0 : health.bounces / health.sessions)})
            </dd>
          </div>
          <div>
            <dt>{t('studioPanel.stats.medianPlay')}</dt>
            <dd>{formatSeconds(health.medianPlaySeconds)}</dd>
          </div>
          <div>
            <dt>{t('studioPanel.stats.totalPlay')}</dt>
            <dd>{formatSeconds(health.totalPlaySeconds)}</dd>
          </div>
          <div>
            <dt>{t('studioPanel.stats.errors')}</dt>
            <dd>{health.errors}</dd>
          </div>
          <div>
            <dt>{t('studioPanel.stats.stallRate')}</dt>
            <dd>{percent(health.stallRate)}</dd>
          </div>
          <div>
            <dt>{t('studioPanel.stats.medianFps')}</dt>
            <dd>{health.medianFps === null ? '—' : Math.round(health.medianFps)}</dd>
          </div>
        </dl>
      )}

      {health && health.errorSamples.length > 0 ? (
        <div className="studio-error-samples">
          <h3>{t('studioPanel.stats.errorSamples')}</h3>
          <ul>
            {health.errorSamples.map((sample) => (
              <li key={sample.message}>
                <code>{sample.message}</code>
                <span>×{sample.count}</span>
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
  const published = isPublished(game);
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
    <div className="studio-improve">
      <h3>{published ? t('studioPanel.improve.titlePublished') : t('studioPanel.improve.titleDraft')}</h3>
      <p>{published ? t('studioPanel.improve.hintPublished') : t('studioPanel.improve.hintDraft')}</p>
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
      {error ? <p className="studio-error">{error}</p> : null}
    </div>
  );
}
