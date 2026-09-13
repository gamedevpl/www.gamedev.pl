import { useEffect, useState } from 'react';
import type { SubmissionStatus } from '../../submissionApi.js';
import { subscribeStudioStatus } from './studioStatusStore.js';
import { pollDelayMs } from './studioStatusPoll.js';

// Retry cadence for a poll whose last attempt failed.
const ERROR_RETRY_MS = 10_000;

// A loop beside the store is a loop outside every gate.
export function useGatedStatusPoll(
  token: string | null,
  locale: string,
  onFailed: (failed: boolean) => void,
): SubmissionStatus | null {
  const [status, setStatus] = useState<SubmissionStatus | null>(null);

  useEffect(() => {
    if (!token) return;
    return subscribeStudioStatus(
      token,
      locale,
      {
        intervalMs: (latest, error) => {
          if (error) return ERROR_RETRY_MS;
          if (!latest) return ERROR_RETRY_MS;
          return pollDelayMs(latest.status, latest.stall, latest.phase);
        },
        onUpdate: (next) => {
          setStatus(next);
          onFailed(false);
        },
        onError: () => onFailed(true),
      },
      // These mount to show current state, so read fresh.
      { forceFreshOnMount: true },
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token, locale]);

  return status;
}
