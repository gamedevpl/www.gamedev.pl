import { useEffect, useRef, useState, type ReactNode, type RefObject } from 'react';
import { useTranslation } from 'react-i18next';
import { PixelIcon } from './PixelIcon.js';
import { formatRelativeTime } from './relativeTime.js';
import type { SubmissionStatus } from './submissionApi.js';
import type { StagePosture } from './StudioStage.js';
import { recordCodeStep } from './visitTelemetry.js';

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
  threadOpen,
  onToggleThread,
  threadUnreadCount,
  canClaim,
  onClaim,
  shareSlot,
  onOpenTheater,
  isCompact = false,
}: StudioStripProps) {
  const { t, i18n } = useTranslation();
  const [overflowOpen, setOverflowOpen] = useState(false);
  const overflowRef = useRef<HTMLDivElement>(null);
  const overflowTriggerRef = useRef<HTMLButtonElement>(null);

  // The D.15 denominator (CE-01): recorded where the door itself renders, not where
  // the surface behind it mounts — otherwise "offered" only ever fires alongside
  // "opened" and the funnel can never show anyone who saw the button and skipped it.
  useEffect(() => {
    if (codeAvailable) recordCodeStep('offered');
  }, [codeAvailable]);

  useEffect(() => {
    if (!isCompact) setOverflowOpen(false);
  }, [isCompact]);

  useEffect(() => {
    if (!overflowOpen) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setOverflowOpen(false);
        overflowTriggerRef.current?.focus();
      }
    };
    // Same idiom as the share popover: outside tap closes it.
    const onPointerDown = (event: PointerEvent) => {
      if (overflowRef.current?.contains(event.target as Node)) return;
      setOverflowOpen(false);
    };
    window.addEventListener('keydown', onKey);
    document.addEventListener('pointerdown', onPointerDown);
    return () => {
      window.removeEventListener('keydown', onKey);
      document.removeEventListener('pointerdown', onPointerDown);
    };
  }, [overflowOpen]);

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
          <div className="studio-head-menu" ref={overflowRef}>
            <button
              type="button"
              ref={overflowTriggerRef}
              className={`studio-head-action is-icon-only${overflowOpen ? ' is-active' : ''}`}
              aria-haspopup="menu"
              aria-expanded={overflowOpen}
              aria-label={t('studioPanel.strip.moreActions')}
              onClick={() => setOverflowOpen((open) => !open)}
            >
              <PixelIcon name="menu" size={12} />{' '}
              <span className="studio-head-action-label">{t('studioPanel.strip.moreActions')}</span>
            </button>
            {overflowOpen ? (
              <div className="studio-head-menu-popover" role="menu" aria-label={t('studioPanel.strip.moreActions')}>
                {codeAvailable ? (
                  <button
                    type="button"
                    role="menuitem"
                    className={`studio-head-menu-item${codeActive ? ' is-active' : ''}`}
                    aria-pressed={codeActive}
                    onClick={() => {
                      setOverflowOpen(false);
                      onToggleCode();
                    }}
                  >
                    <PixelIcon name="code" size={14} />
                    <span>{t('studioPanel.tabs.code')}</span>
                  </button>
                ) : null}

                {editAvailable ? (
                  <button
                    type="button"
                    role="menuitem"
                    className={`studio-head-menu-item${editActive ? ' is-active' : ''}`}
                    aria-pressed={editActive}
                    onClick={() => {
                      setOverflowOpen(false);
                      onToggleEdit();
                    }}
                  >
                    <PixelIcon name="pencil" size={14} />
                    <span>{t('studioPanel.tabs.edit')}</span>
                  </button>
                ) : null}

                {canClaim ? (
                  <button
                    type="button"
                    role="menuitem"
                    className="studio-head-menu-item"
                    onClick={() => {
                      setOverflowOpen(false);
                      onClaim();
                    }}
                  >
                    <PixelIcon name="sparkle" size={14} />
                    <span>{t('creatorProfile.publishGateTitle')}</span>
                  </button>
                ) : null}

                {onOpenTheater ? (
                  <button
                    type="button"
                    role="menuitem"
                    className="studio-head-menu-item"
                    disabled={stageEmpty}
                    onClick={() => {
                      setOverflowOpen(false);
                      onOpenTheater();
                    }}
                  >
                    <PixelIcon name="gamepad" size={14} />
                    <span>{t('studioPanel.stage.openTheater')}</span>
                  </button>
                ) : null}

                {shareSlot}

                <button
                  type="button"
                  role="menuitem"
                  className={`studio-head-menu-item${detailsActive ? ' is-active' : ''}`}
                  aria-pressed={detailsActive}
                  onClick={() => {
                    setOverflowOpen(false);
                    onToggleDetails();
                  }}
                >
                  <PixelIcon name="panel" size={14} />
                  <span>{t('studioPanel.tabs.details')}</span>
                </button>

                <button
                  type="button"
                  role="menuitem"
                  className={`studio-head-menu-item${threadOpen ? ' is-active' : ''}`}
                  aria-pressed={threadOpen}
                  onClick={() => {
                    setOverflowOpen(false);
                    onToggleThread();
                  }}
                >
                  <PixelIcon name="chat" size={14} />
                  <span>{t('studioPanel.rail.chat')}</span>
                  {threadUnreadCount > 0 ? (
                    <span className="studio-chat-unread-badge" aria-hidden="true">
                      {threadUnreadCount > 99 ? '99+' : threadUnreadCount}
                    </span>
                  ) : null}
                </button>
              </div>
            ) : null}
          </div>
        ) : null}
      </div>
    </header>
  );
}
