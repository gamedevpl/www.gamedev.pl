import type { BuilderKind } from '@gamedevpl/contract';
import { useEffect, useRef, useState, type KeyboardEvent } from 'react';
import { createPortal } from 'react-dom';
import { useTranslation } from 'react-i18next';
import { PixelIcon } from '../../PixelIcon.js';
import { studioPath } from '../../core/router.js';
import { connectCardMode, shouldShowConnectCard, type SelfBuildCopyInput } from '../../selfBuildCopy.js';
import { StudioConnectCard } from './StudioConnectCard.js';
import { markStudioOnboarded, resolveWelcomeToken } from './studioWelcome.js';
import { pollDelayMs } from './studioStatusPoll.js';
import {
  buildMediaUrl,
  getSubmissionStatus,
  handoffToPlatform,
  type BuildEvent,
  type SubmissionStatus,
} from '../../submissionApi.js';
import { recordCreateStep, recordStudioStep } from '../../visitTelemetry.js';
import './studio-connect.css';
import './studio-connect-wizard.css';

// Studio owns the full transcript; this step shows only the newest few.
const FEED_LIMIT = 4;

// Focusable controls in the connect dialog.
const FOCUSABLE = 'a[href], button:not([disabled]), input:not([disabled]), [tabindex]:not([tabindex="-1"])';

type StudioConnectWizardProps = {
  // Slug or capability token from the URL.
  game: string;
  onOpenStudio: (path: string, options?: { replace?: boolean }) => void;
};

function copyInputFromStatus(status: SubmissionStatus | null): SelfBuildCopyInput {
  return {
    builder: status?.builder ?? 'self',
    stall: status?.stall,
    phase: status?.phase,
    agentEndedAt: status?.agentEndedAt,
    failureReason: status?.failure?.reason,
  };
}

// The round left the agent's hands: delivered or finished.
const PAST_CONNECT_PHASES: ReadonlySet<string> = new Set([
  'submitted',
  'ready_for_review',
  'publishing',
  'published',
  'needs_changes',
  'failed',
  'canceled',
  'abandoned',
]);

const PAST_CONNECT_STATUSES: ReadonlySet<SubmissionStatus['status']> = new Set([
  'in_review',
  'publishing',
  'published',
  'needs_changes',
  'abandoned',
]);

function connectChapterOver(status: SubmissionStatus | null): boolean {
  if (!status) return false;
  if (status.phase && PAST_CONNECT_PHASES.has(status.phase)) return true;
  if (PAST_CONNECT_STATUSES.has(status.status)) return true;
  return status.stall === 'ended' || Boolean(status.agentEndedAt);
}

function stillNeedsConnect(status: SubmissionStatus | null): boolean {
  if (!status) return true;
  return shouldShowConnectCard(copyInputFromStatus(status));
}

// Full-screen BYOCA connect after Create Now.
export function StudioConnectWizard({ game, onOpenStudio }: StudioConnectWizardProps) {
  const { t, i18n } = useTranslation();
  const wizardRef = useRef<HTMLDivElement>(null);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const [tracksViewport, setTracksViewport] = useState(false);
  const [title, setTitle] = useState(game);
  const [token, setToken] = useState<string | null>(null);
  const [status, setStatus] = useState<SubmissionStatus | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  const awaiting = stillNeedsConnect(status);
  const chapterOver = connectChapterOver(status);
  const roundBuilder = status?.builder ?? 'self';
  const agentConnected = Boolean(status && !awaiting && !chapterOver);
  const goStudioRef = useRef<(deferred: boolean, builder?: BuilderKind, replace?: boolean) => void>(() => {});

  useEffect(() => {
    recordCreateStep('handoff_shown', 'self');
  }, []);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const resolved = await resolveWelcomeToken(game);
      if (cancelled) return;
      setToken(resolved.token);
      setTitle(resolved.title);
    })();
    return () => {
      cancelled = true;
    };
  }, [game]);

  useEffect(() => {
    if (!token) return;
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;

    const pull = async () => {
      try {
        const next = await getSubmissionStatus(token, i18n.language);
        if (cancelled) return;
        setStatus(next);
        setLoadError(null);
        const delay = pollDelayMs(next.status, next.stall, next.phase);
        if (delay != null) {
          timer = setTimeout(() => {
            void pull();
          }, delay);
        }
      } catch {
        if (cancelled) return;
        setLoadError(t('connectWizard.loadError'));
        timer = setTimeout(() => {
          void pull();
        }, 10_000);
      }
    };

    void pull();
    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
  }, [token, i18n.language, t]);

  useEffect(() => {
    headingRef.current?.focus();
  }, []);

  useEffect(() => {
    const viewport = window.visualViewport;
    const root = wizardRef.current;
    if (!viewport || !root) return;

    const sync = () => {
      root.style.setProperty('--qa-viewport-height', `${viewport.height}px`);
      root.style.setProperty('--qa-viewport-offset', `${viewport.offsetTop}px`);
    };

    sync();
    setTracksViewport(true);
    viewport.addEventListener('resize', sync);
    viewport.addEventListener('scroll', sync);
    return () => {
      viewport.removeEventListener('resize', sync);
      viewport.removeEventListener('scroll', sync);
    };
  }, []);

  useEffect(() => {
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = previous;
    };
  }, []);

  const handleTabKey = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key !== 'Tab' || !wizardRef.current) return;
    const nodes = Array.from(wizardRef.current.querySelectorAll<HTMLElement>(FOCUSABLE)).filter(
      (node) => node.offsetParent !== null || node === document.activeElement,
    );
    if (nodes.length === 0) return;
    const first = nodes[0]!;
    const last = nodes[nodes.length - 1]!;
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  };

  const goStudio = (deferred: boolean, builder: BuilderKind = 'self', replace = false) => {
    markStudioOnboarded();
    // Deferred still enters Studio; record both funnel steps.
    if (deferred) {
      recordStudioStep('connect_dismissed', 'self');
    }
    recordCreateStep('handoff_enter_studio', builder);
    const address = status?.slug ?? game;
    const path = `${studioPath(address)}?from=handoff`;
    if (replace) {
      onOpenStudio(path, { replace: true });
    } else {
      onOpenStudio(path);
    }
  };

  useEffect(() => {
    goStudioRef.current = goStudio;
  });

  // Replace: Back would land on this finished round and bounce forward.
  useEffect(() => {
    if (!chapterOver) return;
    goStudioRef.current(false, roundBuilder, true);
  }, [chapterOver, roundBuilder]);

  // Change of mind: hand the round to the Gamedev.pl agent.
  const switchToPlatform = async () => {
    if (!token) return;
    const result = await handoffToPlatform(token);
    if (result.pending) return result;
    goStudio(false, 'platform');
    return result;
  };

  const cardMode = connectCardMode(copyInputFromStatus(status)) ?? 'setup';
  const feed: BuildEvent[] = (status?.events ?? []).slice(0, FEED_LIMIT);
  const reportedProgress = (status?.events ?? []).find((event) => event.progress)?.progress;
  const latestShot = status?.media?.[0];

  return createPortal(
    <div
      className={`qa-wizard studio-connect-wizard${tracksViewport ? ' is-viewport-tracked' : ''}`}
      role="dialog"
      aria-modal="true"
      aria-label={t('connectWizard.dialogLabel')}
      ref={wizardRef}
      onKeyDown={handleTabKey}
      tabIndex={-1}
    >
      <header className="qa-wizard-header">
        <p className="qa-wizard-step" aria-live="polite">
          {t('connectWizard.stepLabel')}
        </p>
      </header>

      <div className="qa-wizard-progress" aria-hidden="true">
        <span className="is-done" />
        <span className="is-done" />
        <span className="is-now" />
      </div>

      <div className="qa-wizard-scroller">
        <div className="qa-stage">
          <p className="qa-stage-eyebrow">{t('connectWizard.eyebrow')}</p>
          <h2 className="qa-title" ref={headingRef} tabIndex={-1}>
            {title}
          </h2>
          <p className="qa-stage-lede">{agentConnected ? t('connectWizard.ledeConnected') : t('connectWizard.lede')}</p>

          {loadError ? <p className="error qa-error">{loadError}</p> : null}

          {agentConnected ? (
            <div className="studio-welcome-progress" role="status" aria-live="polite">
              <p className="studio-welcome-progress-label">
                <PixelIcon name="sparkle" size={13} /> {t('connectWizard.connectedLabel')}
              </p>
              <p className="studio-welcome-progress-message">{t('connectWizard.connectedBody')}</p>
              {reportedProgress && reportedProgress.total > 0 ? (
                <p className="studio-connect-wizard-count">
                  {t('statusView.progress.checklistCount', {
                    done: reportedProgress.done,
                    total: reportedProgress.total,
                  })}
                </p>
              ) : null}
              {feed.length > 0 ? (
                <ul className="studio-connect-wizard-feed" data-testid="connect-wizard-feed">
                  {feed.map((event) => (
                    <li key={event.id}>
                      <span className="studio-connect-wizard-feed-step">
                        {event.step ? t(`statusView.progress.steps.${event.step}`) : t('statusView.progress.agentSays')}
                      </span>{' '}
                      <span className="studio-connect-wizard-feed-text">{event.text}</span>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="studio-connect-wizard-feed-empty">
                  <span className="studio-connect-pulse" aria-hidden="true" />
                  {t('connectWizard.awaitingUpdates')}
                </p>
              )}
              {latestShot && token ? (
                <img
                  className="studio-connect-wizard-shot"
                  src={buildMediaUrl(token, latestShot)}
                  alt={latestShot.label ?? t('connectWizard.shotAlt')}
                  loading="lazy"
                />
              ) : null}
            </div>
          ) : token ? (
            <div className="studio-connect-wizard-card">
              <StudioConnectCard
                token={token}
                collapsible={false}
                agentConnected={false}
                mode={cardMode}
                onSwitchToPlatform={switchToPlatform}
                builderHandoffPending={status?.builderHandoff?.target === 'platform'}
              />
            </div>
          ) : (
            <p className="studio-welcome-primer-one">{t('connectWizard.preparing')}</p>
          )}
        </div>
      </div>

      <footer className="qa-wizard-footer">
        {!agentConnected ? (
          <button type="button" className="btn btn-secondary qa-back" onClick={() => goStudio(true)}>
            {t('connectWizard.later')}
          </button>
        ) : null}
        <button type="button" className="btn btn-primary qa-primary" onClick={() => goStudio(false)}>
          <PixelIcon name="wrench" size={14} />{' '}
          {agentConnected ? t('connectWizard.openStudio') : t('connectWizard.openStudioAnyway')}
        </button>
      </footer>
    </div>,
    document.body,
  );
}
