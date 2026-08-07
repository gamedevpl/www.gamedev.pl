import { useEffect, useRef, useState, type KeyboardEvent } from 'react';
import { createPortal } from 'react-dom';
import { useTranslation } from 'react-i18next';
import { getSavedSpecs } from './mySpecs.js';
import { PixelIcon } from './PixelIcon.js';
import { studioPath } from './router.js';
import { pollDelayMs } from './studioStatusPoll.js';
import { getSubmissionStatus, listMySubmissions, type SubmissionStatus } from './submissionApi.js';
import { recordCreateStep } from './visitTelemetry.js';
import { welcomeProgressMessage, welcomeStatusLabel } from './welcomeProgress.js';

const ONBOARDED_KEY = 'gamedev_studio_onboarded';

/** Tab stops the welcome wizard cycles between. */
const FOCUSABLE = 'a[href], button:not([disabled]), input:not([disabled]), [tabindex]:not([tabindex="-1"])';

export function isStudioOnboarded(): boolean {
  try {
    return localStorage.getItem(ONBOARDED_KEY) === '1';
  } catch {
    return false;
  }
}

export function markStudioOnboarded(): void {
  try {
    localStorage.setItem(ONBOARDED_KEY, '1');
  } catch {
    // Convenience only.
  }
}

/**
 * Resolve the status API's capability token from a URL address (slug or token).
 * Local specs win — they are written on Create Now before this screen mounts.
 */
export async function resolveWelcomeToken(game: string): Promise<{ token: string; title: string } | null> {
  const local = getSavedSpecs().find((spec) => spec.token === game || spec.slug === game);
  if (local) {
    return { token: local.token, title: local.title };
  }
  try {
    const mine = await listMySubmissions();
    const match = mine.find((row) => row.token === game || row.slug === game);
    if (match) {
      return { token: match.token, title: match.title };
    }
  } catch {
    // Fall through — token-shaped addresses still work without the shelf.
  }
  return { token: game, title: game };
}

type StudioWelcomeViewProps = {
  /** Slug or legacy capability token from the URL. */
  game: string;
  onOpenStudio: (path: string) => void;
};

/**
 * Platform create handoff — the wizard continues after Create Now so Studio chrome
 * does not arrive as a teleport. Live progress + a short steer primer; Open Studio
 * is always explicit (never auto-enter).
 */
export function StudioWelcomeView({ game, onOpenStudio }: StudioWelcomeViewProps) {
  const { t, i18n } = useTranslation();
  const wizardRef = useRef<HTMLDivElement>(null);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const [tracksViewport, setTracksViewport] = useState(false);
  const [title, setTitle] = useState(game);
  const [token, setToken] = useState<string | null>(null);
  const [status, setStatus] = useState<SubmissionStatus | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [primerExpanded] = useState(() => !isStudioOnboarded());

  useEffect(() => {
    recordCreateStep('handoff_shown', 'platform');
  }, []);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const resolved = await resolveWelcomeToken(game);
      if (cancelled || !resolved) return;
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
          {t('welcome.stepLabel')}
        </p>
      </header>

      <div className="qa-wizard-progress" aria-hidden="true">
        <span className="is-done" />
        <span className="is-done" />
        <span className="is-now" />
      </div>

      <div className="qa-wizard-scroller">
        <div className="qa-stage">
          <p className="qa-stage-eyebrow">{t('welcome.eyebrow')}</p>
          <h2 className="qa-title" ref={headingRef} tabIndex={-1}>
            {title}
          </h2>
          <p className="qa-stage-lede">{t('welcome.lede')}</p>

          <div className="studio-welcome-progress" role="status" aria-live="polite">
            <p className="studio-welcome-progress-label">
              <PixelIcon name="sparkle" size={13} /> {label}
            </p>
            <p className="studio-welcome-progress-message">{progress}</p>
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
        <button type="button" className="btn btn-primary qa-primary" onClick={openStudio}>
          <PixelIcon name="wrench" size={14} /> {t('welcome.openStudio')}
        </button>
      </footer>
    </div>,
    document.body,
  );
}