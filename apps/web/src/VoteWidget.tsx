import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { AuthModal } from './AuthModal.js';
import { useAuth } from './AuthContext.js';
import { PixelIcon } from './PixelIcon.js';
import { castVote, clearVote, fetchVotes, type VoteCounts } from './votesApi.js';

/**
 * Thumbs-up on a played game (docs/improvement-loop-plan.md, signal source #2).
 *
 * Counts are public — a shared game link shows the real number to a visitor who has
 * never signed in — but casting one needs a session, since a vote is keyed by uid.
 * Signed out, the button stays fully clickable and opens the sign-in modal: greying
 * it out looked like a broken control rather than an auth gate.
 *
 * Downvotes are not offered in the product UI; dislike signal comes from report /
 * written feedback instead.
 */
export function VoteWidget({ slug }: { slug: string }) {
  const { t } = useTranslation();
  const { user } = useAuth();
  const [counts, setCounts] = useState<VoteCounts | null>(null);
  // Vote actions land in a beat; hold the previous counts up rather than blanking the
  // widget on every click.
  const [pending, setPending] = useState(false);
  const [authOpen, setAuthOpen] = useState(false);

  useEffect(() => {
    let cancelled = false;
    fetchVotes(slug)
      .then((result) => {
        if (!cancelled) setCounts(result);
      })
      .catch(() => {
        // Votes are a nice-to-have next to the game itself; a failed read just leaves
        // the widget showing nothing, not an error the player has to deal with.
      });
    return () => {
      cancelled = true;
    };
  }, [slug, user?.uid]);

  if (!counts) return null;

  const toggleUp = async () => {
    if (pending) return;
    if (!user) {
      setAuthOpen(true);
      return;
    }
    setPending(true);
    const next = counts.mine === 'up' ? clearVote(slug) : castVote(slug, 'up');
    try {
      setCounts(await next);
    } catch {
      // Leave the last known counts up rather than losing them over one failed click.
    } finally {
      setPending(false);
    }
  };

  const signedOutTitle = t('player.vote.signInToVote');

  return (
    <>
      <div className="vote-widget">
        <button
          type="button"
          className="secondary-btn vote-btn"
          onClick={() => void toggleUp()}
          disabled={pending}
          aria-pressed={counts.mine === 'up'}
          aria-label={t('player.vote.up')}
          title={user ? t('player.vote.up') : signedOutTitle}
        >
          <PixelIcon name="thumbUp" size={13} />
          <span className="vote-count">{counts.up}</span>
        </button>
      </div>
      <AuthModal
        isOpen={authOpen}
        onClose={() => setAuthOpen(false)}
        title={t('player.vote.signInTitle')}
        subtitle={t('player.vote.signInSubtitle')}
      />
    </>
  );
}
