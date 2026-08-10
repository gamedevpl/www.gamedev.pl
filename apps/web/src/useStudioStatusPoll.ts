import { useEffect, useState } from 'react';
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
  const [status, setStatus] = useState<SubmissionStatus | null>(null);

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
        const next = await getSubmissionStatus(token);
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

    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
  }, [token]);

  return status;
}

/** Rail-open default per owner decision 2 — live-ish rounds open, quiet ones collapse. */
export function defaultRailOpen(status: { status: string } | null): boolean {
  if (!status) return true;
  return status.status === 'queued' || status.status === 'building' || status.status === 'needs_changes';
}
