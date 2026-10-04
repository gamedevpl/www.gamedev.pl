import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { isProposalClosed, myProposals, withdrawProposal, type Proposal, type ProposalState } from './proposalsApi.js';

/**
 * The proposer's tracker: what I sent, and what happened to it.
 *
 * Its whole job is to answer "whose move is it" without the reader working it out. A
 * proposal spends most of its life waiting on somebody, and which somebody it is decides
 * what the reader should do. So the state chip is the loudest thing on each row and the
 * help text says the quiet part: expired and superseded are not rejections.
 *
 * Gate detail stops at pass/fail: a player cannot act on a build log. An accepted
 * proposal to a platform game reads "noted" — the team read it, and no PR follows.
 */

/** How each state reads as a chip: neutral, good, or needs-attention. */
function chipTone(state: ProposalState): 'ok' | 'warn' | 'err' | 'plain' {
  switch (state) {
    case 'merged':
    case 'accepted':
      return 'ok';
    case 'in_review':
    case 'changes_requested':
    case 'needs_work':
      return 'warn';
    case 'declined':
    case 'superseded':
    case 'expired':
      return 'err';
    default:
      return 'plain';
  }
}

function StateChip({ state, noted }: { state: ProposalState; noted: boolean }) {
  const { t } = useTranslation();
  const tone = chipTone(state);
  return (
    <span className={`proposal-chip${tone === 'plain' ? '' : ` is-${tone}`}`}>
      {noted ? t('proposals.noted') : t(`proposals.state.${state}`, { defaultValue: state })}
    </span>
  );
}

function ProposalRow({ proposal, onWithdraw }: { proposal: Proposal; onWithdraw: (id: string) => void }) {
  const { t } = useTranslation();
  // Only ever the newest reviewer turn: the thread is a conversation, but the tracker is a
  // status board, and a row that grew with every exchange would bury the state chip.
  const latestFromReviewer = [...proposal.thread].reverse().find((message) => message.from === 'reviewer');
  const noted = proposal.platformOwned && proposal.state === 'accepted';

  return (
    <article className="proposal-card">
      <div>
        <h3>{proposal.title}</h3>
        <p className="proposal-sub">
          {proposal.platformOwned ? t('proposals.toPlatform') : t('proposals.toOwner', { handle: proposal.targetSlug })}
          {' · '}
          {proposal.targetSlug}
        </p>
      </div>

      <div className="proposal-chips">
        <StateChip state={proposal.state} noted={noted} />
        {proposal.gate ? (
          <span className={`proposal-chip ${proposal.gate.green ? 'is-ok' : 'is-err'}`}>
            {proposal.gate.green ? t('proposals.checksPassed') : t('proposals.checksFailed')}
          </span>
        ) : null}
        {proposal.behaviouralDiff ? (
          <span className="proposal-chip is-warn">{t('proposals.behaviouralDiff')}</span>
        ) : null}
      </div>

      {latestFromReviewer ? (
        <div className="proposal-reviewer-note">
          <span className="proposal-note-from">{t('proposals.fromReviewer')}</span>
          {latestFromReviewer.text}
        </div>
      ) : null}

      {proposal.state === 'superseded' ? <p className="proposal-sub">{t('proposals.supersededHelp')}</p> : null}
      {proposal.state === 'expired' ? <p className="proposal-sub">{t('proposals.expiredHelp')}</p> : null}
      {noted ? <p className="proposal-sub">{t('proposals.notedHelp')}</p> : null}
      {proposal.state === 'merged' ? (
        <p className="proposal-sub">
          {t('proposals.mergedHelp')} {t('proposals.watcher')}
        </p>
      ) : null}

      {!isProposalClosed(proposal.state) && proposal.state !== 'accepted' ? (
        <div className="proposal-actions">
          <button type="button" className="remix-btn is-quiet" onClick={() => onWithdraw(proposal.id)}>
            {t('proposals.withdraw')}
          </button>
        </div>
      ) : null}
    </article>
  );
}

export function ProposalsPage() {
  const { t } = useTranslation();
  const [proposals, setProposals] = useState<Proposal[] | null>(null);

  const load = useCallback(() => {
    myProposals()
      .then(setProposals)
      // An empty list and a failed load look the same on screen, which is wrong but
      // survivable here: this page has no destructive action, and a retry is a refresh.
      .catch(() => setProposals([]));
  }, []);

  useEffect(load, [load]);

  const withdraw = useCallback(
    (id: string) => {
      void withdrawProposal(id)
        .then((updated) =>
          setProposals((current) =>
            current ? current.map((proposal) => (proposal.id === updated.id ? updated : proposal)) : current,
          ),
        )
        .catch(load);
    },
    [load],
  );

  return (
    <main className="proposals-page">
      <h1>{t('proposals.navTitle')}</h1>
      {proposals === null ? null : proposals.length === 0 ? (
        <p className="proposals-empty">{t('proposals.empty')}</p>
      ) : (
        proposals.map((proposal) => <ProposalRow key={proposal.id} proposal={proposal} onWithdraw={withdraw} />)
      )}
    </main>
  );
}
