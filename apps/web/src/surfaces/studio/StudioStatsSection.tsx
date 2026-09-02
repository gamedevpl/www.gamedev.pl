import { useTranslation } from 'react-i18next';
import type { GameHealth } from '../../healthApi.js';
import type { StudioGame, StudioScorecard } from '../../studioApi.js';
import { AutonomySetting } from './AutonomySetting.js';
import { formatSeconds } from './studioHealth.js';
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
  healthDays: string[];
  truncated: boolean;
  scorecard: StudioScorecard | null;
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

      <PlayerReactions scorecard={scorecard} />

      <SuggestedImprovements slug={game.slug} />

      <AutonomySetting slug={game.slug} />

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
