import { useEffect, useRef, useState, type KeyboardEvent } from 'react';
import { createPortal } from 'react-dom';
import { useTranslation } from 'react-i18next';
import { InteractiveMascot, type MascotEmotion } from './Mascot.js';
import { PixelIcon } from './PixelIcon.js';
import { studioPath } from './router.js';
import { BuildProgressChecklist } from './BuildProgressChecklist.js';
import { isStudioOnboarded, markStudioOnboarded, resolveWelcomeToken } from './studioWelcome.js';
import { pollDelayMs } from './studioStatusPoll.js';
import { getSubmissionStatus, type SubmissionStatus } from './submissionApi.js';
import { recordCreateStep } from './visitTelemetry.js';
import { welcomeProgressMessage, welcomeStatusLabel } from './welcomeProgress.js';

// Focusable controls inside the welcome dialog.
const FOCUSABLE = 'a[href], button:not([disabled]), input:not([disabled]), [tabindex]:not([tabindex="-1"])';

function computeStartTime(status: SubmissionStatus | null, mountedAt: number): number {
  if (!status) return mountedAt;

  if (status.events && status.events.length > 0) {
    const times = status.events.map((e) => Date.parse(e.createdAt)).filter((t) => !isNaN(t) && t > 0);
    if (times.length > 0) {
      return Math.min(...times);
    }
  }

  if (status.progress?.commits && status.progress.commits.length > 0) {
    const times = status.progress.commits.map((c) => Date.parse(c.committedDate)).filter((t) => !isNaN(t) && t > 0);
    if (times.length > 0) {
      return Math.min(...times);
    }
  }

  if (status.lastAgentSignalAt) {
    const t = Date.parse(status.lastAgentSignalAt);
    if (!isNaN(t) && t > 0 && t < mountedAt) return t;
  }

  return mountedAt;
}

function computeEndTime(status: SubmissionStatus | null): number | null {
  if (!status) return null;
  if (status.agentEndedAt) {
    const t = Date.parse(status.agentEndedAt);
    if (!isNaN(t) && t > 0) return t;
  }
  if (status.events && status.events.length > 0) {
    const times = status.events.map((e) => Date.parse(e.createdAt)).filter((t) => !isNaN(t) && t > 0);
    if (times.length > 0) {
      return Math.max(...times);
    }
  }
  if (status.lastAgentSignalAt) {
    const t = Date.parse(status.lastAgentSignalAt);
    if (!isNaN(t) && t > 0) return t;
  }
  return null;
}

function formatElapsed(elapsedMs: number): string {
  const totalSecs = Math.max(0, Math.floor(elapsedMs / 1000));
  const mins = Math.floor(totalSecs / 60);
  const secs = totalSecs % 60;
  if (mins > 0) {
    return `${mins}m ${secs.toString().padStart(2, '0')}s`;
  }
  return `${secs}s`;
}

function getMascotEmotion(status: SubmissionStatus | null): MascotEmotion {
  if (!status) return 'busy';
  switch (status.status) {
    case 'published':
      return 'excited';
    case 'needs_changes':
      return 'confused';
    case 'in_review':
    case 'publishing':
      return 'proud';
    case 'abandoned':
      return 'sad';
    case 'queued':
      return 'curious';
    case 'building':
    default:
      return 'busy';
  }
}

type StudioWelcomeViewProps = {
  // Slug or capability token from the URL.
  game: string;
  onOpenStudio: (path: string) => void;
};

// Full-screen platform handoff after Create Now.
export function StudioWelcomeView({ game, onOpenStudio }: StudioWelcomeViewProps) {
  const { t, i18n } = useTranslation();
  const wizardRef = useRef<HTMLDivElement>(null);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const mountedAtRef = useRef<number>(Date.now());
  const [tracksViewport, setTracksViewport] = useState(false);
  const [title, setTitle] = useState(game);
  const [token, setToken] = useState<string | null>(null);
  const [status, setStatus] = useState<SubmissionStatus | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [primerExpanded] = useState(() => !isStudioOnboarded());
  const [now, setNow] = useState<number>(() => Date.now());

  const isReady =
    status != null &&
    (status.status === 'in_review' ||
      status.status === 'published' ||
      status.phase === 'ready_for_review' ||
      status.phase === 'published' ||
      (status.playable != null && status.playable.length > 0) ||
      status.preview != null);

  const isNeedsChanges =
    status != null && (status.status === 'needs_changes' || status.phase === 'needs_changes' || status.failure != null);

  const isRunning = !status || (!isReady && !isNeedsChanges && status.status !== 'abandoned');

  useEffect(() => {
    recordCreateStep('handoff_shown', 'platform');
  }, []);

  useEffect(() => {
    if (!isRunning) return;
    const timer = setInterval(() => {
      setNow(Date.now());
    }, 1000);
    return () => clearInterval(timer);
  }, [isRunning]);

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
        setLoadError(t('welcome.loadError'));
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

  const openStudio = () => {
    markStudioOnboarded();
    recordCreateStep('handoff_enter_studio', 'platform');
    const address = status?.slug ?? game;
    onOpenStudio(`${studioPath(address)}?from=handoff`);
  };

  const progress = welcomeProgressMessage(status, t);
  const label = welcomeStatusLabel(status, t);
  const startTime = computeStartTime(status, mountedAtRef.current);
  const endTime = isRunning ? null : computeEndTime(status);
  const elapsedMs = Math.max(0, (endTime ?? now) - startTime);
  const elapsedText = formatElapsed(elapsedMs);
  const mascotEmotion = getMascotEmotion(status);

  return createPortal(
    <div
      className={`qa-wizard studio-welcome${tracksViewport ? ' is-viewport-tracked' : ''}`}
      role="dialog"
      aria-modal="true"
      aria-label={t('welcome.dialogLabel')}
      ref={wizardRef}
      onKeyDown={handleTabKey}
      tabIndex={-1}
    >
      <header className="qa-wizard-header">
        <p className="qa-wizard-step" aria-live="polite">
          {isReady
            ? t('welcome.stepLabelReady')
            : isNeedsChanges
              ? t('welcome.stepLabelAttention')
              : t('welcome.stepLabel')}
        </p>
      </header>

      <div className="qa-wizard-progress" aria-hidden="true">
        <span className="is-done" />
        <span className="is-done" />
        <span className={isReady ? 'is-done' : 'is-now'} />
      </div>

      <div className="qa-wizard-scroller">
        <div className="qa-stage">
          <div className="studio-welcome-hero">
            <div className="studio-welcome-hero-text">
              <p className="qa-stage-eyebrow">
                <span
                  className={`studio-welcome-pulse-dot${isReady ? ' is-ready' : isRunning ? ' is-pulsing' : ''}`}
                  aria-hidden="true"
                />
                {isReady
                  ? t('welcome.eyebrowReady')
                  : isNeedsChanges
                    ? t('welcome.eyebrowAttention')
                    : t('welcome.eyebrow')}
              </p>
              <h2 className="qa-title" ref={headingRef} tabIndex={-1}>
                {title}
              </h2>
            </div>
            <div className="studio-welcome-mascot-wrap">
              <InteractiveMascot
                size={72}
                className="studio-welcome-mascot"
                idleEmotion={mascotEmotion}
                pokeLabel={t('welcome.mascotPoke')}
              />
              <div
                className={`studio-welcome-mascot-glow${isReady ? ' is-ready' : isRunning ? ' is-glowing' : ''}`}
                aria-hidden="true"
              />
            </div>
          </div>

          <p className="qa-stage-lede">{isReady ? t('welcome.ledeReady') : t('welcome.lede')}</p>

          <div className={`studio-welcome-progress${isReady ? ' is-ready' : isRunning ? ' is-running' : ''}`}>
            <div className="studio-welcome-progress-header">
              <p className="studio-welcome-progress-label">
                <span className="studio-welcome-live-badge" aria-hidden="true">
                  {isReady ? (
                    <PixelIcon name="check" size={13} />
                  ) : (
                    <>
                      <span className={`studio-welcome-pulse-ring${isRunning ? ' is-pulsing' : ''}`} />
                      <PixelIcon name="sparkle" size={13} />
                    </>
                  )}
                </span>
                {isReady ? t('welcome.statusReadyLabel') : label}
              </p>
              {elapsedText ? (
                <span
                  className="studio-welcome-timer"
                  aria-hidden="true"
                  title={t(isReady ? 'welcome.completedIn' : 'welcome.runningFor', { time: elapsedText })}
                >
                  <PixelIcon name="clock" size={12} />
                  <span>{isReady ? t('welcome.completedIn', { time: elapsedText }) : elapsedText}</span>
                </span>
              ) : null}
            </div>
            <p className="studio-welcome-progress-message" role="status" aria-live="polite">
              {progress}
            </p>
            {isRunning && token ? (
              <div className="studio-welcome-checklist">
                <BuildProgressChecklist
                  progress={status?.progress ?? null}
                  events={status?.events ?? []}
                  loaded={status != null}
                />
              </div>
            ) : null}
            {isReady ? (
              <button type="button" className="studio-welcome-ready-callout" onClick={openStudio}>
                <p className="studio-welcome-ready-title">
                  <PixelIcon name="play" size={14} /> {t('welcome.readyBanner')}
                </p>
              </button>
            ) : null}
            {loadError ? <p className="error qa-error">{loadError}</p> : null}
          </div>

          <div className={`studio-welcome-primer${primerExpanded ? ' is-expanded' : ''}`}>
            <h3 className="studio-welcome-primer-title">{t('welcome.primerTitle')}</h3>
            {primerExpanded ? (
              <ul className="studio-welcome-primer-list">
                <li>{t('welcome.primerSteer')}</li>
                <li>{t('welcome.primerPlay')}</li>
                <li>{t('welcome.primerLeave')}</li>
              </ul>
            ) : (
              <p className="studio-welcome-primer-one">{t('welcome.primerOneLine')}</p>
            )}
          </div>

          <details className="studio-welcome-more">
            <summary>{t('welcome.moreSummary')}</summary>
            <p>{t('welcome.moreBody')}</p>
          </details>
        </div>
      </div>

      <footer className="qa-wizard-footer">
        <button
          type="button"
          className={`btn btn-primary qa-primary${isReady ? ' is-ready-cta' : ''}`}
          onClick={openStudio}
        >
          <PixelIcon name={isReady ? 'play' : 'wrench'} size={14} />{' '}
          {isReady ? t('welcome.playDraft') : t('welcome.openStudio')}
        </button>
      </footer>
    </div>,
    document.body,
  );
}
