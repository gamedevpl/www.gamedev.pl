import { useEffect, useState } from 'react';
import {
  fetchNotificationPreferences,
  onNotificationPreferencesChanged,
  updateNotificationPreferences,
} from '../../notificationsApi.js';

// A blip must not hide a card; nor may we poll forever.
export const PROPOSAL_PREFS_ATTEMPTS = 3;
export const PROPOSAL_PREFS_RETRY_MS = 4000;

export interface ProposalsMuted {
  // Null until the account preference is known; cards wait for it.
  muted: boolean | null;
  mute: () => void;
}

// Reads the persisted mute once, when a proposal is on screen.
export function useProposalsMuted(proposalOnScreen: boolean): ProposalsMuted {
  const [muted, setMuted] = useState<boolean | null>(null);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    if (muted !== null || !proposalOnScreen || attempt >= PROPOSAL_PREFS_ATTEMPTS) return;
    let cancelled = false;
    let retry: ReturnType<typeof setTimeout> | undefined;
    fetchNotificationPreferences()
      .then((prefs) => {
        if (!cancelled) setMuted(prefs.proposals === false);
      })
      .catch(() => {
        // Unknown, not unmuted; bumping state is what retries.
        if (!cancelled) retry = setTimeout(() => setAttempt((n) => n + 1), PROPOSAL_PREFS_RETRY_MS);
      });
    return () => {
      cancelled = true;
      if (retry) clearTimeout(retry);
    };
  }, [proposalOnScreen, muted, attempt]);

  // The bell carries the same switch; its toggle must reach the card.
  useEffect(
    () =>
      onNotificationPreferencesChanged((prefs) => {
        if (prefs.proposals !== undefined) setMuted(prefs.proposals === false);
      }),
    [],
  );

  return {
    muted,
    mute: () => {
      setMuted(true);
      // Roll back a failed write; a card must not lie about muting.
      void updateNotificationPreferences({ proposals: false }).catch(() => setMuted(false));
    },
  };
}
