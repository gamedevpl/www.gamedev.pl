import { useEffect, useState, type ReactNode, type RefObject } from 'react';
import { useTranslation } from 'react-i18next';
import { latestAgentActivityAt } from '../../agentActivity.js';
import { PixelIcon } from '../../PixelIcon.js';
import { playPath } from '../../core/router.js';
import { StudioBuildBar } from './StudioBuildBar.js';
import { StudioStripOverflowMenu } from './StudioStripOverflowMenu.js';
import { formatRelativeTime } from '../../relativeTime.js';
import type { SubmissionStatus } from '../../submissionApi.js';
import type { StagePosture } from './StudioStage.js';
import { recordCodeStep } from '../../visitTelemetry.js';

// Always over the stage: a workroom, so no auto-hide (B1).

const HEARTBEAT_STATES = new Set<SubmissionStatus['status']>(['queued', 'building', 'in_review', 'publishing']);

export type StudioStripProps = {
  title: string;
  slug?: string;
  status: SubmissionStatus | null;
  posture: StagePosture;
  onPostureChange: (posture: StagePosture) => void;
  /** Nothing has landed on the stage yet — Play has nothing to hand focus to. */
  stageEmpty: boolean;
  onOpenShelf: () => void;
  shelfOpenRef?: RefObject<HTMLButtonElement>;
  shelfOpen: boolean;
  editAvailable: boolean;
  editActive: boolean;
  onToggleEdit: () => void;
  /** The Code surface (CE-06) — the `</>` entry, following the Edit triplet exactly. */
  codeAvailable: boolean;
  codeActive: boolean;
  onToggleCode: () => void;
  detailsActive: boolean;
  onToggleDetails: () => void;
  onOpenBuild: () => void;
  threadOpen: boolean;
  onToggleThread: () => void;
  threadUnreadCount: number;
  canClaim: boolean;
  onClaim: () => void;
  shareSlot?: ReactNode;
  /** Opens the build in the full site `GameTheater` (fullscreen, share, report) — see
   * studio-game-first-implementation-plan.md's follow-up: the stage's own play posture
   * is Studio's lighter theater, and this is the way to the site's fuller one. */
  onOpenTheater?: () => void;
  // ≤800px (shelfIsDrawer): fold secondary actions behind a ⋯ menu.
  isCompact?: boolean;
  // Replaces the global header's back arrow, hidden below 800px.
  onExit?: () => void;
  isChromeIdle?: boolean;
};

export function StudioStrip({
  title,
  slug,
  status,
  posture,
  onPostureChange,
  stageEmpty,
  onOpenShelf,
  shelfOpenRef,
  shelfOpen,
  editAvailable,
  editActive,
  onToggleEdit,
  codeAvailable,
  codeActive,
  onToggleCode,
  detailsActive,
  onToggleDetails,
  onOpenBuild,
  threadOpen,
  onToggleThread,
  threadUnreadCount,
  canClaim,
  onClaim,
  shareSlot,
  onOpenTheater,
  isCompact = false,
  onExit,
  isChromeIdle = false,
}: StudioStripProps) {
  const { t, i18n } = useTranslation();
  const [overflowOpen, setOverflowOpen] = useState(false);

  // The D.15 denominator (CE-01): recorded where the door itself renders, not where
  // the surface behind it mounts — otherwise "offered" only ever fires alongside
  // "opened" and the funnel can never show anyone who saw the button and skipped it.
  useEffect(() => {
    if (codeAvailable) recordCodeStep('offered');
  }, [codeAvailable]);

  useEffect(() => {
    if (!isCompact) setOverflowOpen(false);
  }, [isCompact]);

  const heartbeatAt = latestAgentActivityAt(status);
  const showPhasePill = Boolean(status && HEARTBEAT_STATES.has(status.status) && !status.recentBuilds?.length);
  const phaseLabel = status
    ? status.phase === 'dispatched'
      ? t('statusView.phaseLabels.dispatched')
      : t(`statusView.states.${status.status}.label`)
    : null;

  const chromeHidden = isChromeIdle && !overflowOpen;

  return (
    <header className={`studio-strip${chromeHidden ? ' is-idle' : ''}`} aria-hidden={chromeHidden}>
      {isCompact && onExit ? (
        <button type="button" className="studio-strip-exit" onClick={onExit} aria-label={t('studioPanel.strip.exit')}>
          <PixelIcon name="arrowLeft" size={16} />
        </button>
      ) : null}

      <button
        type="button"
        className="studio-shelf-open"
        ref={shelfOpenRef}
        onClick={onOpenShelf}
        aria-expanded={shelfOpen}
        aria-label={t('studioPanel.shelf.openShelf')}
      >
        <PixelIcon name="folder" size={12} />
        <span className="studio-shelf-open-label">{t('studioPanel.shelf.openShelf')}</span>
      </button>

      <div className="studio-strip-title-block">
        <h2 className="studio-strip-title">
          {slug ? (
            <a href={playPath(slug)} className="studio-strip-title-link">
              {title}
            </a>
          ) : (
            title
          )}
        </h2>
      </div>

      <div className="studio-strip-spacer" />

      <div className="studio-strip-status">
        <StudioBuildBar status={status} onOpen={onOpenBuild} />
        {showPhasePill ? (
          <button
            type="button"
            className="studio-strip-phase-button"
            onClick={onOpenBuild}
            aria-label={t('studioPanel.buildBar.open')}
          >
            <span className="studio-strip-phase-pill">{phaseLabel}</span>
            {heartbeatAt != null ? (
              <span className="studio-strip-heartbeat">
                {t('statusView.updatedAgo', { time: formatRelativeTime(heartbeatAt, i18n.language) })}
              </span>
            ) : null}
          </button>
        ) : (
          heartbeatAt != null && (
            <span className="studio-strip-heartbeat">
              {t('statusView.updatedAgo', { time: formatRelativeTime(heartbeatAt, i18n.language) })}
            </span>
          )
        )}
      </div>

      <div className="studio-strip-spacer" />

      <div className="studio-strip-actions">
        {editAvailable && !isCompact ? (
          <button
            type="button"
            className={`studio-head-action is-icon-only${editActive ? ' is-active' : ''}`}
            aria-pressed={editActive}
            aria-label={t('studioPanel.tabs.edit')}
            onClick={onToggleEdit}
          >
            <PixelIcon name="pencil" size={12} />{' '}
            <span className="studio-head-action-label">{t('studioPanel.tabs.edit')}</span>
          </button>
        ) : null}

        {codeAvailable && !isCompact ? (
          // Visible label like Play's: the bare glyph read as decoration.
          <button
            type="button"
            className={`studio-head-action${codeActive ? ' is-active' : ''}`}
            aria-pressed={codeActive}
            aria-label={t('studioPanel.tabs.code')}
            onClick={onToggleCode}
          >
            <PixelIcon name="code" size={12} />{' '}
            <span className="studio-head-action-label">{t('studioPanel.tabs.code')}</span>
          </button>
        ) : null}

        {canClaim && !isCompact ? (
          <button
            type="button"
            className="studio-head-action is-icon-only studio-head-action--claim"
            onClick={onClaim}
            aria-label={t('creatorProfile.publishGateTitle')}
          >
            <PixelIcon name="sparkle" size={12} />{' '}
            <span className="studio-head-action-label">{t('creatorProfile.publishGateTitle')}</span>
          </button>
        ) : null}

        <button
          type="button"
          className={`studio-head-action is-primary is-play${posture === 'play' ? ' is-active' : ''}`}
          aria-pressed={posture === 'play'}
          aria-label={posture === 'play' ? t('studioPanel.stage.stopPlaying') : undefined}
          disabled={posture === 'watch' && stageEmpty}
          onClick={() => onPostureChange(posture === 'play' ? 'watch' : 'play')}
        >
          <PixelIcon name={posture === 'play' ? 'close' : 'play'} size={14} />{' '}
          <span className="studio-head-action-label">
            {posture === 'play' ? t('studioPanel.stage.stopPlaying') : t('studioPanel.tabs.playtest')}
          </span>
        </button>

        {onOpenTheater && !isCompact ? (
          <button
            type="button"
            className="studio-head-action is-icon-only"
            aria-label={t('studioPanel.stage.openTheater')}
            title={t('studioPanel.stage.openTheater')}
            disabled={stageEmpty}
            onClick={onOpenTheater}
          >
            <PixelIcon name="gamepad" size={12} />{' '}
            <span className="studio-head-action-label">{t('studioPanel.stage.openTheater')}</span>
          </button>
        ) : null}

        {!isCompact ? shareSlot : null}

        {!isCompact ? (
          <button
            type="button"
            className={`studio-head-action is-icon-only${detailsActive ? ' is-active' : ''}`}
            aria-pressed={detailsActive}
            aria-label={t('studioPanel.tabs.details')}
            onClick={onToggleDetails}
          >
            <PixelIcon name="panel" size={12} />{' '}
            <span className="studio-head-action-label">{t('studioPanel.tabs.details')}</span>
          </button>
        ) : null}

        {!isCompact ? (
          <button
            type="button"
            className={`studio-head-action studio-head-action--chat${threadOpen ? ' is-active' : ''}`}
            aria-pressed={threadOpen}
            aria-label={t(threadOpen ? 'studioPanel.rail.closeThread' : 'studioPanel.rail.openThread')}
            title={t(threadOpen ? 'studioPanel.rail.closeThread' : 'studioPanel.rail.openThread')}
            onClick={onToggleThread}
          >
            <PixelIcon name="chat" size={12} />
            <span className="studio-head-action-label">{t('studioPanel.rail.chat')}</span>
            {threadUnreadCount > 0 ? (
              <span className="studio-chat-unread-badge" aria-hidden="true">
                {threadUnreadCount > 99 ? '99+' : threadUnreadCount}
              </span>
            ) : null}
          </button>
        ) : null}

        {isCompact ? (
          <StudioStripOverflowMenu
            codeAvailable={codeAvailable}
            codeActive={codeActive}
            onToggleCode={onToggleCode}
            editAvailable={editAvailable}
            editActive={editActive}
            onToggleEdit={onToggleEdit}
            canClaim={canClaim}
            onClaim={onClaim}
            stageEmpty={stageEmpty}
            onOpenTheater={onOpenTheater}
            shareSlot={shareSlot}
            detailsActive={detailsActive}
            onToggleDetails={onToggleDetails}
            threadOpen={threadOpen}
            onToggleThread={onToggleThread}
            threadUnreadCount={threadUnreadCount}
            onOpenChange={setOverflowOpen}
          />
        ) : null}
      </div>
    </header>
  );
}
