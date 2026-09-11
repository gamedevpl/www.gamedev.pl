import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ProposalReviewCard } from './ProposalReviewCard.js';
import { myReviews, platformProposals, type Proposal } from '../../proposalsApi.js';

/**
 * The reviewer's queue — proposals waiting on a decision.
 *
 * One component, two seats, chosen by `scope`: a creator's own games or the platform's.
 * The list call differs because the API keeps those seats apart; everything after it is
 * identical, which is the point — an operator reviewing a catalog game and a creator
 * reviewing their own are doing the same work and should not be learning two surfaces.
 *
 * Decided proposals stay in the list once decided rather than vanishing, so a reviewer can
 * see what they just did. What is never here is anything the gate has not passed: a change
 * that does not run never becomes somebody else's problem.
 */
export function ProposalReviewPanel(props: {
  scope: 'mine' | 'platform';
  /** Filters to one game, for the Studio thread where a card belongs to its game. */
  slug?: string;
  onPlay?: (proposal: Proposal) => void;
}) {
  const { t } = useTranslation();
  const [proposals, setProposals] = useState<Proposal[] | null>(null);

  const load = useCallback(() => {
    const fetcher = props.scope === 'platform' ? platformProposals : myReviews;
    fetcher()
      .then((all) => setProposals(props.slug ? all.filter((one) => one.targetSlug === props.slug) : all))
      // An operator without admin rights gets a 404 here, which is the intended answer —
      // the queue does not confirm its own existence. Empty is the honest rendering.
      .catch(() => setProposals([]));
  }, [props.scope, props.slug]);

  useEffect(load, [load]);

  const replace = useCallback((updated: Proposal) => {
    setProposals((current) => (current ? current.map((one) => (one.id === updated.id ? updated : one)) : current));
  }, []);

  if (proposals === null) return null;
  if (proposals.length === 0) {
    // Silent inside a Studio thread: a game with no proposals should not carry a line
    // about a feature its owner may never have turned on. The standalone queue says so.
    return props.slug ? null : <p className="proposals-empty">{t('reviews.empty')}</p>;
  }

  return (
    <section className="proposal-review-list" aria-label={t('reviews.navTitle')}>
      {proposals.map((proposal) => (
        <ProposalReviewCard key={proposal.id} proposal={proposal} onChanged={replace} onPlay={props.onPlay} />
      ))}
    </section>
  );
}
