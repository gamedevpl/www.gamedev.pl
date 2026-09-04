import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { PixelIcon, type PixelIconName } from '../../PixelIcon.js';
import { formatRelativeTime, formatSeconds } from '../../relativeTime.js';
import type { GameHealth } from '../../healthApi.js';
import { abandonSubmission, deleteGame } from '../../submissionApi.js';
import type { StudioScorecard } from '../../studioApi.js';
import { isStudioGamePublished, isStudioGameShelfLive, type StudioShelfGame } from '../../studioShelf.js';
import { ContributionsSetting } from '../../ContributionsSetting.js';
import { ProposalReviewPanel } from '../review/ProposalReviewPanel.js';
import { DraftShareControl } from './DraftShareControl.js';
import { StatsSection } from './StudioStatsSection.js';
import { StudioConnectCard } from './StudioConnectCard.js';
import { StudioCreatorAgentKeyPanel } from './StudioCreatorAgentKeyPanel.js';
import { StudioDetailsBuildProgress } from './StudioDetailsBuildProgress.js';
import { StudioDetailsMedia } from './StudioDetailsMedia.js';
import { StudioOAuthClientsPanel } from './StudioOAuthClientsPanel.js';
import { StudioPatPanel } from './StudioPatPanel.js';
import { StudioWorkspaceCheckoutPanel } from './StudioWorkspaceCheckoutPanel.js';

// One pane at a time, chosen by icon.
export type DetailsPaneId = 'overview' | 'connect' | 'build' | 'media' | 'workspace' | 'keys' | 'stats';

type DetailsPaneDef = {
  id: DetailsPaneId;
  icon: PixelIconName;
  labelKey: string;
};

// Everything about the game; the thread is where it is talked to.
export function DetailsPanel({
  game,
  mediaToken,
  health,
  days,
  healthDays,
  truncated,
  scorecard,
  pane,
  onPaneChange,
  onClose,
  onDaysChange,
  onOpenPlaytest,
  onSelectPreviewVersion,
  activePreviewVersion,
  onReverted,
  onSwitchToPlatform,
  onPlay,
  onDraftSharedChange,
  onRemoved,
}: {
  game: StudioShelfGame;
  // Media and build-round token; differs from game.token during handoff.
  mediaToken?: string;
  health: GameHealth | null;
  days: number;
  healthDays: string[];
  truncated: boolean;
  scorecard: StudioScorecard | null;
  pane: DetailsPaneId;
  onPaneChange: (pane: DetailsPaneId) => void;
  onClose: () => void;
  onDaysChange: (days: number) => void;
  onOpenPlaytest: () => void;
  onSelectPreviewVersion?: (version: string | null) => void;
  activePreviewVersion?: string | null;
  onReverted?: (result: { version: string; token?: string; roundOpened?: number }) => void;
  onSwitchToPlatform: () => Promise<void>;
  onPlay: () => void;
  onDraftSharedChange: (shared: boolean) => void;
  onRemoved: (token: string) => void | Promise<void>;
}) {
  const { t, i18n } = useTranslation();
  // This *job* is published — composer/playtest routing. Distinct from catalog-live below.
  const publishedJob = isStudioGamePublished(game);
  const catalogLive = isStudioGameShelfLive(game);
  const publishedAt = game.publishedAt ?? game.livePublishedAt;
  const [abandonArmed, setAbandonArmed] = useState(false);
  const [abandoning, setAbandoning] = useState(false);
  const [deleteArmed, setDeleteArmed] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const shotToken = mediaToken ?? game.token;

  async function handleAbandon() {
    if (!abandonArmed) {
      setAbandonArmed(true);
      return;
    }
    setAbandoning(true);
    try {
      await abandonSubmission(game.token);
      await onRemoved(game.token);
    } catch {
      setAbandoning(false);
      setAbandonArmed(false);
    }
  }

  async function handleDelete() {
    if (!deleteArmed) {
      setDeleteArmed(true);
      return;
    }
    setDeleting(true);
    try {
      await deleteGame(game.token);
      await onRemoved(game.token);
    } catch {
      setDeleting(false);
      setDeleteArmed(false);
    }
  }

  const showConnect = game.lastKnownStatus !== 'abandoned' && game.lastKnownStatus !== 'published';
  // A handoff round is live under mediaToken while game reads published.
  const inHandoffRound = Boolean(mediaToken && mediaToken !== game.token);
  const showProgress = showConnect || inHandoffRound;
  // Workspace gets its own pane: behind the keys icon it was undiscoverable.
  const panes: DetailsPaneDef[] = [
    { id: 'overview', icon: 'eye', labelKey: 'studioPanel.rail.overview' },
    ...(showConnect ? [{ id: 'connect' as const, icon: 'signal' as const, labelKey: 'studioPanel.rail.connect' }] : []),
    ...(showProgress ? [{ id: 'build' as const, icon: 'wrench' as const, labelKey: 'studioPanel.rail.build' }] : []),
    { id: 'media', icon: 'image', labelKey: 'studioPanel.rail.media' },
    // No slug means no sources yet, and the route would refuse it.
    ...(game.slug && game.lastKnownStatus !== 'abandoned'
      ? [{ id: 'workspace' as const, icon: 'download' as const, labelKey: 'studioPanel.rail.workspace' }]
      : []),
    { id: 'keys', icon: 'lock', labelKey: 'studioPanel.rail.credentials' },
    ...(catalogLive ? [{ id: 'stats' as const, icon: 'star' as const, labelKey: 'studioPanel.rail.stats' }] : []),
  ];

  // Fall back when the open pane disappears mid-session.
  const activePane = panes.some((entry) => entry.id === pane) ? pane : 'overview';
  // Contributions live in overview: a tab per setting makes a menu.

  // Published only: there is nothing to propose against a draft.
  const showContributions = activePane === 'overview' && catalogLive;
  const activeLabel = t(panes.find((entry) => entry.id === activePane)?.labelKey ?? 'studioPanel.tabs.details');

  return (
    <div className="studio-rail-shell" data-testid="studio-rail-shell">
      <div className="studio-rail-head">
        <h3>{activeLabel}</h3>
        <button type="button" className="modal-close-btn" onClick={onClose} aria-label={t('studioPanel.close')}>
          <PixelIcon name="close" size={14} />
        </button>
      </div>

      <div className="studio-rail-pane studio-overview" data-testid={`studio-rail-pane-${activePane}`}>
        {activePane === 'overview' ? (
          <>
            <section className="studio-rail-section" aria-label={t('studioPanel.overview.status')}>
              <ul className="funnel-stats studio-facts">
                <li>
                  <span className="funnel-stat-value">
                    {formatRelativeTime(Date.parse(game.createdAt), i18n.language)}
                  </span>
                  <span className="funnel-stat-label">{t('studioPanel.overview.created')}</span>
                </li>
                {publishedAt ? (
                  <li>
                    <span className="funnel-stat-value">
                      {formatRelativeTime(Date.parse(publishedAt), i18n.language)}
                    </span>
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
                {catalogLive && game.slug ? (
                  <button type="button" className="primary-btn" onClick={onPlay}>
                    <PixelIcon name="play" size={12} /> {t('myGames.play')}
                  </button>
                ) : null}
                <button type="button" className="secondary-btn" onClick={onOpenPlaytest}>
                  <PixelIcon name="play" size={12} /> {t('studioPanel.overview.playtest')}
                </button>
                {!publishedJob && game.lastKnownStatus !== 'abandoned' ? (
                  <div className="studio-abandon-block">
                    {abandonArmed && !catalogLive ? (
                      <p className="studio-abandon-hint">{t('studioPanel.overview.abandonHintRemove')}</p>
                    ) : null}
                    <button
                      type="button"
                      className={`status-abandon${abandonArmed ? ' is-danger' : ''}`}
                      onClick={() => void handleAbandon()}
                      disabled={abandoning}
                    >
                      {abandonArmed
                        ? t(
                            catalogLive
                              ? 'studioPanel.overview.abandonConfirmKeepLive'
                              : 'studioPanel.overview.abandonConfirmRemove',
                          )
                        : t(catalogLive ? 'studioPanel.overview.abandon' : 'studioPanel.overview.abandonRemove')}
                    </button>
                  </div>
                ) : null}
                {catalogLive && game.lastKnownStatus !== 'abandoned' ? (
                  <div className="studio-delete-block">
                    {deleteArmed ? <p className="studio-delete-hint">{t('studioPanel.overview.deleteHint')}</p> : null}
                    <button
                      type="button"
                      className={`status-delete${deleteArmed ? ' is-danger' : ''}`}
                      onClick={() => void handleDelete()}
                      disabled={deleting}
                    >
                      {deleteArmed ? t('studioPanel.overview.deleteConfirm') : t('studioPanel.overview.delete')}
                    </button>
                  </div>
                ) : null}
              </div>
            </section>

            {game.slug && game.lastKnownStatus !== 'abandoned' ? (
              <section
                className="studio-rail-section"
                aria-label={t(catalogLive ? 'studioPanel.share.liveTitle' : 'studioPanel.share.title')}
              >
                <DraftShareControl game={game} live={catalogLive} onSharedChange={onDraftSharedChange} />
              </section>
            ) : null}
          </>
        ) : null}

        {showContributions && game.slug ? (
          <div className="studio-rail-contributions">
            <ContributionsSetting slug={game.slug} />
            <ProposalReviewPanel scope="mine" slug={game.slug} />
          </div>
        ) : null}

        {activePane === 'connect' ? (
          showConnect ? (
            <StudioConnectCard
              token={game.token}
              collapsible={false}
              hideIfUnavailable
              unavailableLabel={t('studioPanel.rail.connectEmpty')}
              density="panel"
              onSwitchToPlatform={onSwitchToPlatform}
            />
          ) : (
            <p className="studio-rail-empty">{t('studioPanel.rail.connectEmpty')}</p>
          )
        ) : null}

        {activePane === 'build' ? (
          showProgress ? (
            <StudioDetailsBuildProgress
              token={shotToken}
              emptyLabel={t('studioPanel.rail.buildEmpty')}
              onSelectPreviewVersion={onSelectPreviewVersion}
              activePreviewVersion={activePreviewVersion}
              onReverted={onReverted}
            />
          ) : (
            <p className="studio-rail-empty">{t('studioPanel.rail.buildEmpty')}</p>
          )
        ) : null}

        {activePane === 'media' ? (
          <StudioDetailsMedia token={shotToken} emptyLabel={t('studioPanel.rail.mediaEmpty')} />
        ) : null}

        {activePane === 'keys' ? (
          <div className="studio-rail-credentials-body">
            <p className="studio-rail-credentials-hint">{t('studioPanel.rail.credentialsHint')}</p>
            <StudioCreatorAgentKeyPanel />
            <StudioPatPanel />
            <StudioOAuthClientsPanel />
          </div>
        ) : null}

        {activePane === 'workspace' && game.slug ? <StudioWorkspaceCheckoutPanel slug={game.slug} /> : null}

        {activePane === 'stats' && catalogLive ? (
          <StatsSection
            game={game}
            health={health}
            days={days}
            healthDays={healthDays}
            truncated={truncated}
            scorecard={scorecard}
            onDaysChange={onDaysChange}
          />
        ) : null}
      </div>

      <nav className="studio-rail-icons" aria-label={t('studioPanel.tabs.details')}>
        {panes.map((entry) => (
          <button
            key={entry.id}
            type="button"
            className={`studio-rail-icon${activePane === entry.id ? ' is-active' : ''}`}
            aria-pressed={activePane === entry.id}
            aria-label={t(entry.labelKey)}
            title={t(entry.labelKey)}
            data-testid={`studio-rail-icon-${entry.id}`}
            onClick={() => onPaneChange(entry.id)}
          >
            <PixelIcon name={entry.icon} size={14} />
          </button>
        ))}
      </nav>
    </div>
  );
}
