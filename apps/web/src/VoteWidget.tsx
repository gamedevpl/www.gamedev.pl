import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useAuth } from './AuthContext';
import { PixelIcon } from './PixelIcon';
import { castVote, clearVote, fetchVotes, type VoteCounts, type VoteValue } from './votesApi';

/**
 * Thumbs up/down on a played game (docs/improvement-loop-plan.md, signal source #2).
 *
 * Counts are public — a shared game link shows real numbers to a visitor who has never
 * signed in — but casting one needs a session, since a vote is keyed by uid. Signed
 * out, the buttons show what a vote would need without pretending to accept one.
 */
export function VoteWidget({ slug }: { slug: string }) {
  const { t } = useTranslation();
  const { user } = useAuth();
  const [counts, setCounts] = useState<VoteCounts | null>(null);
  // Vote actions land in a beat; hold the previous counts up rather than blanking the
  // widget on every click.
  const [pending, setPending] = useState(false);

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
  }, [slug]);

  if (!counts) return null;

  const cast = async (value: VoteValue) => {
    if (!user || pending) return;
    setPending(true);
    const next = counts.mine === value ? clearVote(slug) : castVote(slug, value);
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
    <div className="vote-widget" role="group" aria-label={t('player.vote.groupLabel')}>
      <button
        className="secondary-btn vote-btn"
        onClick={() => cast('up')}
        disabled={!user || pending}
        aria-pressed={counts.mine === 'up'}
        aria-label={t('player.vote.up')}
        title={user ? t('player.vote.up') : signedOutTitle}
      >
        <PixelIcon name="thumbUp" size={13} />
        <span className="vote-count">{counts.up}</span>
      </button>
      <button
        className="secondary-btn vote-btn"
        onClick={() => cast('down')}
        disabled={!user || pending}
        aria-pressed={counts.mine === 'down'}
        aria-label={t('player.vote.down')}
        title={user ? t('player.vote.down') : signedOutTitle}
      >
        <PixelIcon name="thumbDown" size={13} />
        <span className="vote-count">{counts.down}</span>
      </button>
    </div>
  );
}
