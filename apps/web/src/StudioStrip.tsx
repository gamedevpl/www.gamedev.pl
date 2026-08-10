import { type ReactNode, type RefObject } from 'react';
import { useTranslation } from 'react-i18next';
import { PixelIcon } from './PixelIcon.js';
import { formatRelativeTime } from './relativeTime.js';
import type { SubmissionStatus } from './submissionApi.js';
import type { StagePosture } from './StudioStage.js';

/**
 * Replaces `.studio-detail-head` (Workstream B1): a thin, translucent bar that stays
 * over the stage always — the studio is a workroom, not the public play page, so no
 * auto-hide (a deliberate divergence from the shipped player auto-hide; see the plan's
 * "standing unless reversed" section).
 */

const HEARTBEAT_STATES = new Set<SubmissionStatus['status']>(['queued', 'building', 'in_review', 'publishing']);

function latestAgentActivityAt(status: SubmissionStatus | null): number | null {
  if (!status) return null;
  const times = [
    ...(status.lastAgentSignalAt ? [Date.parse(status.lastAgentSignalAt)] : []),
    ...(status.events ?? []).map((event) => Date.parse(event.createdAt)),
    ...(status.playable ?? []).map((item) => (item.createdAt ? Date.parse(item.createdAt) : Number.NaN)),
    ...(status.progress?.commits ?? []).map((commit) => Date.parse(commit.committedDate)),
  ].filter((time) => Number.isFinite(time));
  return times.length > 0 ? Math.max(...times) : null;
}

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
  canClaim: boolean;
  onClaim: () => void;
  shareSlot?: ReactNode;
  /** Opens the build in the full site `GameTheater` (fullscreen, share, report) — see
   * studio-game-first-implementation-plan.md's follow-up: the stage's own play posture
   * is Studio's lighter theater, and this is the way to the site's fuller one. */
  onOpenTheater?: () => void;
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
  canClaim,
  onClaim,
  shareSlot,
  onOpenTheater,
}: StudioStripProps) {
  const { t, i18n } = useTranslation();
  const heartbeatAt = latestAgentActivityAt(status);
  const showPhasePill = Boolean(status && HEARTBEAT_STATES.has(status.status));
  const phaseLabel = status
    ? status.phase === 'dispatched'
      ? t('statusView.phaseLabels.dispatched')
      : t(`statusView.states.${status.status}.label`)
    : null;

  return (
    <header className="studio-strip">
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
        <h2 className="studio-strip-title">{title}</h2>
        {slug ? <code className="studio-slug">{slug}</code> : null}
        {showPhasePill ? <span className="studio-strip-phase-pill">{phaseLabel}</span> : null}
        {heartbeatAt != null ? (
          <span className="studio-strip-heartbeat">
            {t('statusView.updatedAgo', { time: formatRelativeTime(heartbeatAt, i18n.language) })}
          </span>
        ) : null}
      </div>

      <div className="studio-strip-spacer" />

      <div className="studio-strip-actions">
        {editAvailable ? (
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

        {codeAvailable ? (
          <button
            type="button"
            className={`studio-head-action is-icon-only${codeActive ? ' is-active' : ''}`}
            aria-pressed={codeActive}
            aria-label={t('studioPanel.tabs.code')}
            onClick={onToggleCode}
          >
            <PixelIcon name="code" size={12} />{' '}
            <span className="studio-head-action-label">{t('studioPanel.tabs.code')}</span>
          </button>
        ) : null}

        {canClaim ? (
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
          disabled={posture === 'watch' && stageEmpty}
          onClick={() => onPostureChange(posture === 'play' ? 'watch' : 'play')}
        >
          <PixelIcon name={posture === 'play' ? 'close' : 'play'} size={14} />{' '}
          <span className="studio-head-action-label">
            {posture === 'play' ? t('studioPanel.stage.stopPlaying') : t('studioPanel.tabs.playtest')}
          </span>
        </button>

        {onOpenTheater ? (
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

        {shareSlot}

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
      </div>
    </header>
  );
}
