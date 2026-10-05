import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ProposalBlockAction } from './ProposalBlockAction.js';
import { ProposalDiffView } from './ProposalDiffView.js';
import { isStaleRefusal, reviewErrorKey, type ReviewAction } from './proposalErrors.js';
import {
  acceptProposal,
  declineProposal,
  DECLINE_REASONS,
  getProposal,
  requestProposalChanges,
  type DeclineReason,
  type Proposal,
} from '../../proposalsApi.js';
import '../../propose-composer.css';

/**
 * One proposal, from the reviewer's seat.
 *
 * The same card serves a creator and an operator: the decision is the same, only the
 * authority differs, and the API resolves that. Two cards would drift.
 *
 * Order is the argument: play it, then the verdict, then the words, then the buttons —
 * "is this good" is answered by playing, so the diff is a second click.
 *
 * Accept carries a line of help because the word implies publication; nothing here
 * publishes. On a platform game it reads "Mark as noted": the proposal is feedback the
 * team reads, and accepting only closes it.
 */

export function ProposalReviewCard(props: {
  proposal: Proposal;
  scope?: 'mine' | 'platform';
  /** Handle of whoever sent it, when the caller has resolved one. */
  proposerHandle?: string | null;
  onChanged: (proposal: Proposal) => void;
  onPlay?: (proposal: Proposal) => void;
  onViewChanges?: (proposal: Proposal) => void;
}) {
  const { t } = useTranslation();
  const { proposal } = props;
  const [busy, setBusy] = useState(false);
  const [mode, setMode] = useState<'idle' | 'changes' | 'decline'>('idle');
  const platform = props.scope === 'platform' || proposal.platformOwned;
  const handle = props.proposerHandle ?? proposal.proposerUid;
  const [showDiff, setShowDiff] = useState(false);
  const [text, setText] = useState('');
  const [reason, setReason] = useState<DeclineReason>('not_the_direction');
  const [error, setError] = useState<string | null>(null);

  async function run(kind: ReviewAction, action: () => Promise<Proposal>) {
    setBusy(true);
    setError(null);
    try {
      props.onChanged(await action());
      setMode('idle');
      setText('');
    } catch (err) {
      setError(t(reviewErrorKey(err, kind)));
      // Somebody else moved it: show where it stands now.
      if (isStaleRefusal(err)) void getProposal(proposal.id).then(props.onChanged, () => {});
    } finally {
      setBusy(false);
    }
  }

  return (
    <article className="proposal-card">
      <div>
        <h3>{proposal.title}</h3>
        <p className="proposal-sub">
          {t('reviews.cardTitle', { handle })} · {proposal.targetSlug}
        </p>
      </div>

      <p className="proposal-description">{proposal.description}</p>

      <div className="proposal-chips">
        {proposal.gate?.green ? <span className="proposal-chip is-ok">{t('proposals.checksPassed')}</span> : null}
        {proposal.behaviouralDiff ? (
          <span className="proposal-chip is-warn">{t('proposals.behaviouralDiff')}</span>
        ) : null}
        {proposal.platformOwned ? <span className="proposal-chip">{t('proposals.toPlatform')}</span> : null}
      </div>

      {error ? (
        <p className="propose-error" role="alert">
          {error}
        </p>
      ) : null}

      {mode === 'changes' ? (
        <div className="propose-composer">
          <label className="propose-field">
            <span>{t('reviews.requestChanges')}</span>
            <textarea
              rows={3}
              value={text}
              maxLength={2000}
              placeholder={t('reviews.changesPlaceholder')}
              onChange={(event) => setText(event.target.value)}
              disabled={busy}
            />
          </label>
          <div className="propose-actions">
            <button
              type="button"
              className="remix-btn is-primary"
              disabled={busy || text.trim().length < 2}
              onClick={() => void run('changes', () => requestProposalChanges(proposal.id, text.trim()))}
            >
              {t('reviews.requestChanges')}
            </button>
            <button type="button" className="remix-btn is-quiet" disabled={busy} onClick={() => setMode('idle')}>
              {t('propose.cancel')}
            </button>
          </div>
        </div>
      ) : mode === 'decline' ? (
        <div className="propose-composer">
          <label className="propose-field">
            <span>{t('reviews.declineReason.label')}</span>
            <select value={reason} onChange={(event) => setReason(event.target.value as DeclineReason)} disabled={busy}>
              {DECLINE_REASONS.map((value) => (
                <option key={value} value={value}>
                  {t(`reviews.declineReason.${value}`)}
                </option>
              ))}
            </select>
          </label>
          <label className="propose-field">
            <span>{t('reviews.declineNote')}</span>
            <textarea
              rows={2}
              value={text}
              maxLength={2000}
              onChange={(event) => setText(event.target.value)}
              disabled={busy}
            />
          </label>
          <div className="propose-actions">
            <button
              type="button"
              className="remix-btn is-primary"
              disabled={busy}
              onClick={() => void run('decline', () => declineProposal(proposal.id, reason, text.trim() || undefined))}
            >
              {t('reviews.decline')}
            </button>
            <button type="button" className="remix-btn is-quiet" disabled={busy} onClick={() => setMode('idle')}>
              {t('propose.cancel')}
            </button>
          </div>
        </div>
      ) : (
        <>
          <div className="proposal-actions">
            {props.onPlay ? (
              <button type="button" className="remix-btn is-primary" onClick={() => props.onPlay?.(proposal)}>
                ▶ {t('reviews.play')}
              </button>
            ) : null}
            <button
              type="button"
              className="remix-btn is-quiet"
              aria-expanded={showDiff}
              onClick={() => {
                setShowDiff((open) => !open);
                props.onViewChanges?.(proposal);
              }}
            >
              {t('reviews.viewChanges')}
            </button>
            <button
              type="button"
              className="remix-btn is-quiet"
              disabled={busy}
              onClick={() => void run('accept', () => acceptProposal(proposal.id))}
            >
              {platform ? t('reviews.markNoted') : t('reviews.accept')}
            </button>
            <button type="button" className="remix-btn is-quiet" disabled={busy} onClick={() => setMode('changes')}>
              {t('reviews.requestChanges')}
            </button>
            <button type="button" className="remix-btn is-quiet" disabled={busy} onClick={() => setMode('decline')}>
              {t('reviews.decline')}
            </button>
          </div>
          {showDiff ? <ProposalDiffView proposalId={proposal.id} /> : null}
          {/* Said on the card, not in a confirm dialog: it is the fact that makes accepting
              safe to try, and a dialog would put it where only the hesitant would read it. */}
          <p className="propose-note">{platform ? t('reviews.notedHelp') : t('reviews.acceptHelp')}</p>
          {platform ? null : <ProposalBlockAction proposerUid={proposal.proposerUid} handle={handle} />}
        </>
      )}
    </article>
  );
}
