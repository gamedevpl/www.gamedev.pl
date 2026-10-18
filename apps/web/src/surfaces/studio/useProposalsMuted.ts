import { useEffect, useState } from 'react';
import { fetchGameDreams, onGameDreamsChanged, setGameDreams } from '../../gameDreamsApi.js';
import {
  fetchNotificationPreferences,
  onNotificationPreferencesChanged,
  updateNotificationPreferences,
} from '../../notificationsApi.js';

// A blip must not hide a card, nor retries become a poll.
export const PROPOSAL_PREFS_ATTEMPTS = 3;
export const PROPOSAL_PREFS_RETRY_MS = 4000;
// After the quick tries, slow down rather than stop: an outage ends.
export const PROPOSAL_PREFS_SLOW_RETRY_MS = 60_000;

export interface ProposalsMuted {
  // Null until both switches are known; cards wait for it.
  muted: boolean | null;
  mute: () => void;
}

// Reads both mutes once a proposal shows; muting hits the game.
export function useProposalsMuted(proposalOnScreen: boolean, slug?: string): ProposalsMuted {
  const [accountMuted, setAccountMuted] = useState<boolean | null>(null);
  // No slug means no game switch, so it counts as on.
  const [gameOff, setGameOff] = useState<boolean | null>(slug ? null : false);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    setGameOff(slug ? null : false);
  }, [slug]);

  useEffect(() => {
    if ((accountMuted !== null && gameOff !== null) || !proposalOnScreen) return;
    let cancelled = false;
    let retry: ReturnType<typeof setTimeout> | undefined;
    Promise.all([
      accountMuted === null ? fetchNotificationPreferences().then((prefs) => prefs.proposals === false) : accountMuted,
      gameOff === null && slug
        ? fetchGameDreams(slug).then(
            (dreams) => !dreams.on,
            // Not the owner's game: no switch of theirs to honour.
            (error: { status?: number }) => {
              if (error.status === 404) return false;
              throw error;
            },
          )
        : gameOff,
    ])
      .then(([account, game]) => {
        if (cancelled) return;
        setAccountMuted(account);
        setGameOff(game);
      })
      .catch(() => {
        // Unknown, not unmuted; bumping state is what retries.
        const spent = attempt + 1 >= PROPOSAL_PREFS_ATTEMPTS;
        const delay = spent ? PROPOSAL_PREFS_SLOW_RETRY_MS : PROPOSAL_PREFS_RETRY_MS;
        if (!cancelled) retry = setTimeout(() => setAttempt((n) => n + 1), delay);
      });
    return () => {
      cancelled = true;
      if (retry) clearTimeout(retry);
    };
  }, [proposalOnScreen, accountMuted, gameOff, slug, attempt]);

  // The bell and the rail flip these too; the card must follow.
  useEffect(
    () =>
      onNotificationPreferencesChanged((prefs) => {
        if (prefs.proposals !== undefined) setAccountMuted(prefs.proposals === false);
      }),
    [],
  );
  useEffect(
    () =>
      onGameDreamsChanged((changed, dreams) => {
        if (changed === slug) setGameOff(!dreams.on);
      }),
    [slug],
  );

  return {
    muted: accountMuted === null || gameOff === null ? null : accountMuted || gameOff,
    mute: () => {
      if (slug) {
        setGameOff(true);
        // Roll back a failed write; a card must not lie about muting.
        void setGameDreams(slug, false).catch(() => setGameOff(false));
        return;
      }
      setAccountMuted(true);
      void updateNotificationPreferences({ proposals: false }).catch(() => setAccountMuted(false));
    },
  };
}
