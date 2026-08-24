import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { getSubmissionStatus, type SubmissionApiError, type SubmissionStatus } from './submissionApi.js';

const ACTIVE_STATES = new Set(['queued', 'building', 'in_review', 'publishing']);

/** Poll cadence: brisk while the round is doing something, relaxed once it is quiet. */
function delayFor(status: SubmissionStatus | null): number {
  if (!status) return 3000;
  if (status.status === 'published' || status.status === 'abandoned') return 60000;
  return ACTIVE_STATES.has(status.status) ? 4000 : 15000;
}

/**
 * A second, independent poll of the same status endpoint the embedded thread
 * (`SubmissionStatusView`) already polls for its own transcript. Feeds
 * `useStageSource`, `StudioStrip`'s phase pill/heartbeat, and `StudioVersionRibbon`'s
 * gate signals — surfaces the thread does not expose upward.
 *
 * Deliberately not unified with the thread's poller: doing that would mean lifting
 * `SubmissionStatusView`'s status ownership out from under its own status-transition
 * side effects (telemetry, pending-revision reconciliation), which is a larger and
 * riskier refactor than one more idempotent GET at a relaxed cadence.
 */
export function useStudioStatusPoll(token: string | null): SubmissionStatus | null {
  // Without a locale the stage reads English while the thread reads Polish.
  const { i18n } = useTranslation();
  const locale = i18n.language;
  const [status, setStatus] = useState<SubmissionStatus | null>(null);
  const [statusToken, setStatusToken] = useState(token);

  // React's sanctioned render-phase bailout ("adjusting state when a prop changes"):
  // an *effect*-based reset alone would let this same render pass the previous game's
  // status to a freshly key-remounted `StudioStage` (via useStageSource) before the
  // effect ever runs (Codex review of PR #739).
  if (token !== statusToken) {
    setStatusToken(token);
    setStatus(null);
  }

  useEffect(() => {
    if (!token) {
      setStatus(null);
      return;
    }
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    setStatus(null);

    const tick = async () => {
      try {
        const next = await getSubmissionStatus(token, locale);
        if (cancelled) return;
        setStatus(next);
        timer = setTimeout(() => void tick(), delayFor(next));
      } catch (err) {
        if (cancelled) return;
        const apiError = err as SubmissionApiError;
        // Invalid token: the thread already reports this; nothing to poll for here.
        if (apiError.status === 400) return;
        timer = setTimeout(() => void tick(), delayFor(null));
      }
    };
    void tick();

    // A backgrounded tab's timers get throttled, sometimes for minutes — exactly the
    // window a self-build agent uses to open and finish a round unwatched. Poll again
    // the moment the tab is looked at, rather than waiting out the clamp.
    //
    // Sleep/wake can leave the tab "visible" with no edge to catch.
    const onVisibility = () => {
      if (document.visibilityState !== 'visible') return;
      if (timer) clearTimeout(timer);
      void tick();
    };
    const onWake = () => {
      if (timer) clearTimeout(timer);
      void tick();
    };
    document.addEventListener('visibilitychange', onVisibility);
    window.addEventListener('focus', onWake);
    window.addEventListener('pageshow', onWake);

    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
      document.removeEventListener('visibilitychange', onVisibility);
      window.removeEventListener('focus', onWake);
      window.removeEventListener('pageshow', onWake);
    };
  }, [token, locale]);

  return status;
}

/** Rail-open default per owner decision 2 — live-ish rounds open, quiet ones collapse. */
export function defaultRailOpen(status: { status: string } | null): boolean {
  if (!status) return true;
  return status.status === 'queued' || status.status === 'building' || status.status === 'needs_changes';
}
