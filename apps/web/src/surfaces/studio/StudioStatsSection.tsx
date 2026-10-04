import { useState } from 'react';
import { StudioPerformance } from './StudioPerformance.js';
import { useTranslation } from 'react-i18next';
import type { GameHealth } from '../../healthApi.js';
import type { StudioGame, StudioScorecard } from '../../studioApi.js';
import { AutonomySetting } from './AutonomySetting.js';
import { formatSeconds } from '../../relativeTime.js';
import { SuggestedImprovements } from './StudioSuggestions.js';

const WINDOWS = [1, 7, 30];

function percent(rate: number): string {
  return `${Math.round(rate * 100)}%`;
}

export function StatsSection({
  game,
  health,
  days,
  healthDays,
  truncated,
  scorecard,
  onDaysChange,
}: {
  game: StudioGame;
  health: GameHealth | null;
  days: number;
  // Null when the health read failed.
  healthDays: string[] | null;
  truncated: boolean;
  scorecard: StudioScorecard | null;
  onDaysChange: (days: number) => void;
}) {
  const { t } = useTranslation();
  const hasPerformance = Boolean(
    (game.publishedAt || game.livePublishedAt) && game.live !== false && game.viewerRole !== 'editor',
  );
  const [view, setView] = useState('performance');
  const activeView = view === 'performance' && !hasPerformance ? 'traffic' : view;
  const views = [...(hasPerformance ? ['performance'] : []), 'traffic', 'feedback', 'improvements'];

  if (!game.slug) {
    return <p className="studio-empty">{t('studioPanel.stats.noSlug')}</p>;
  }

  return (
    <div className="studio-stats">
      <nav className="studio-stats-views" aria-label={t('studioPanel.stats.views')}>
        {views.map((entry) => (
          <button key={entry} type="button" aria-pressed={activeView === entry} onClick={() => setView(entry)}>
            {t(`studioPanel.stats.view.${entry}`)}
            {entry === 'feedback' && scorecard && (
              <span className="studio-stats-badge">
                {scorecard.feedbackCount + scorecard.votes.up + scorecard.votes.down}
              </span>
            )}
          </button>
        ))}
      </nav>
      <div hidden={activeView !== 'traffic' && activeView !== 'performance'} className="health-windows">
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

      <section hidden={activeView !== 'traffic'} aria-label={t('studioPanel.stats.view.traffic')}>
        <p className="health-note">{t('studioPanel.stats.trafficScope')}</p>
        {healthDays === null ? <p className="health-note">{t('studioPanel.stats.unavailable')}</p> : null}
        {healthDays && healthDays.length > 0 ? (
          <p className="studio-stats-range">
            {t('studioPanel.stats.range', { from: healthDays[healthDays.length - 1], to: healthDays[0] })}
          </p>
        ) : null}
        {truncated ? <p className="health-note">{t('studioPanel.stats.truncated')}</p> : null}

        {healthDays === null ? null : !health || health.sessions === 0 ? (
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
              <span className="funnel-stat-value">
                {health.medianFps === null ? '—' : Math.round(health.medianFps)}
              </span>
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
      </section>
      {hasPerformance && (
        <div hidden={activeView !== 'performance'}>
          <StudioPerformance key={game.slug} slug={game.slug} days={days} />
        </div>
      )}
      <section hidden={activeView !== 'feedback'} aria-label={t('studioPanel.stats.reactions')}>
        {scorecard ? (
          <PlayerReactions scorecard={scorecard} />
        ) : (
          <p className="health-note">{t('studioPanel.stats.reactionsUnavailable')}</p>
        )}
      </section>
      <section hidden={activeView !== 'improvements'} aria-label={t('studioPanel.stats.view.improvements')}>
        <SuggestedImprovements slug={game.slug} />
        <AutonomySetting slug={game.slug} />
      </section>
    </div>
  );
}

// Votes and player notes come from the nightly scorecard's fixed roll.

// Themes are player-written text, labelled so they read as theirs.
function PlayerReactions({ scorecard }: { scorecard: StudioScorecard | null }) {
  const { t } = useTranslation();

  // Absent, not zero: this game has not been rolled up yet.
  if (!scorecard) return null;

  const themes = scorecard.untrustedThemes;
  const nothingYet = scorecard.votes.up === 0 && scorecard.votes.down === 0 && scorecard.feedbackCount === 0;

  return (
    <div className="studio-reactions">
      <h3 className="health-section-title">{t('studioPanel.stats.reactions')}</h3>
      <p className="studio-stats-range">{t('studioPanel.stats.reactionsWindow', { days: scorecard.windowDays })}</p>

      {nothingYet ? (
        <p className="studio-empty">{t('studioPanel.stats.reactionsEmpty')}</p>
      ) : (
        <ul className="funnel-stats">
          <li>
            <span className="funnel-stat-value">
              {scorecard.votes.up}↑ {scorecard.votes.down}↓
            </span>
            <span className="funnel-stat-label">{t('studioPanel.stats.votes')}</span>
          </li>
          <li>
            <span className="funnel-stat-value">{scorecard.feedbackCount}</span>
            <span className="funnel-stat-label">{t('studioPanel.stats.notes')}</span>
          </li>
        </ul>
      )}

      {themes.length > 0 ? (
        <div className="studio-themes">
          <h4 className="studio-themes-title">{t('studioPanel.stats.themes')}</h4>
          <p className="health-note">{t('studioPanel.stats.themesNote')}</p>
          <ul className="studio-theme-list">
            {themes.map((entry) => (
              <li key={entry.theme}>
                {entry.theme} <span className="health-error-count">×{entry.count}</span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
}
