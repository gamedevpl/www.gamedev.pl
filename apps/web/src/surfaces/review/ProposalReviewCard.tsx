import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ProposalDiffView } from './ProposalDiffView.js';
import {
  acceptProposal,
  declineProposal,
  DECLINE_REASONS,
  requestProposalChanges,
  type DeclineReason,
  type Proposal,
} from '../../proposalsApi.js';
import '../../propose-composer.css';

/**
 * One proposal, from the reviewer's seat.
 *
 * The same card serves a creator reviewing their own game and an operator reviewing a
 * platform-owned one, because the decision is the same decision — only the authority
 * differs, and the API already resolves that. Two cards would drift, and the one that
 * drifted would be the operator's, which is the one nobody uses daily.
 *
 * Order is the argument: play it, then the verdict, then the words, then the buttons. A
 * creator judging a stranger's change to their game is being asked "is this good", and the
 * honest way to answer is to play it — so the playable preview leads and the diff is a
 * second click, not a wall of TypeScript in front of the decision.
 *
 * The accept button says "Accept…" with an ellipsis and carries a line of help, because
 * the word on its own implies publication. It does not publish. Nothing here does.
 */

export function ProposalReviewCard(props: {
  proposal: Proposal;
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
  // The diff is a second click, not a wall of TypeScript in front of the decision: a
  // creator judging a stranger's change is being asked "is this good", and the honest way
  // to answer that is to play it.
  const [showDiff, setShowDiff] = useState(false);
  const [text, setText] = useState('');
  const [reason, setReason] = useState<DeclineReason>('not_the_direction');
  const [error, setError] = useState<string | null>(null);

  async function run(action: () => Promise<Proposal>) {
    setBusy(true);
    setError(null);
    try {
      props.onChanged(await action());
      setMode('idle');
      setText('');
    } catch {
      // Deliberately vague here and specific nowhere else: every failure a reviewer can
      // hit on this card is either a race (somebody else decided first) or a transient,
      // and both are answered by looking again.
      setError(t('propose.errors.generic'));
    } finally {
      setBusy(false);
    }
  }

  return (
    <article className="proposal-card">
      <div>
        <h3>{proposal.title}</h3>
        <p className="proposal-sub">
          {t('reviews.cardTitle', { handle: props.proposerHandle ?? proposal.proposerUid })} · {proposal.targetSlug}
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
              onClick={() => void run(() => requestProposalChanges(proposal.id, text.trim()))}
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
              onClick={() => void run(() => declineProposal(proposal.id, reason, text.trim() || undefined))}
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
              onClick={() => void run(() => acceptProposal(proposal.id))}
            >
              {t('reviews.accept')}
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
          <p className="propose-note">{t('reviews.acceptHelp')}</p>
        </>
      )}
    </article>
  );
}
