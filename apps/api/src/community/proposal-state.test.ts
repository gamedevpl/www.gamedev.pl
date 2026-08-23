import { describe, expect, it } from 'vitest';
import {
  canTransitionProposal,
  countsAsOpen,
  DECLINE_REASONS,
  isBaseStale,
  isModerationDecline,
  isProposerTurn,
  isReviewerVisible,
  isTerminalProposal,
  owesStatementOfReasons,
  PROPOSAL_STATES,
  toPublicProposalState,
  type ProposalState,
} from './proposal-state.js';

describe('proposal state projection', () => {
  it('maps every internal state to a public one', () => {
    for (const state of PROPOSAL_STATES) {
      expect(toPublicProposalState(state)).toBeTruthy();
    }
  });

  it('hides our own checking behind one word', () => {
    // Whether the queue or the gate is busy is not the proposer's business.
    expect(toPublicProposalState('submitted')).toBe('checking');
    expect(toPublicProposalState('gating')).toBe('checking');
  });

  it('keeps "it did not run" distinct from "the owner wants something else"', () => {
    // Different work answers each; collapsing them would tell the proposer to guess.
    expect(toPublicProposalState('needs_work')).toBe('needs_work');
    expect(toPublicProposalState('changes_requested')).toBe('changes_requested');
  });
});

describe('reviewer visibility', () => {
  it('never shows a proposal that has not passed the gate', () => {
    // The load-bearing anti-abuse property: reaching a creator at all costs a change
    // that compiles, runs, and passes the same gate their own deliveries pass.
    expect(isReviewerVisible('draft')).toBe(false);
    expect(isReviewerVisible('submitted')).toBe(false);
    expect(isReviewerVisible('gating')).toBe(false);
    expect(isReviewerVisible('needs_work')).toBe(false);
  });

  it('shows green proposals and keeps decided ones visible', () => {
    expect(isReviewerVisible('in_review')).toBe(true);
    expect(isReviewerVisible('accepted')).toBe(true);
    expect(isReviewerVisible('declined')).toBe(true);
    expect(isReviewerVisible('merged')).toBe(true);
  });

  it('hides a withdrawn proposal — taking it back means taking it back', () => {
    expect(isReviewerVisible('withdrawn')).toBe(false);
  });
});

describe('proposal transitions', () => {
  it('never publishes: no state reaches merged except through accepted', () => {
    // `merged` means the owner published an adopted version. Nothing else may claim it.
    const reachMerged = PROPOSAL_STATES.filter((from) => canTransitionProposal(from, 'merged'));
    expect(reachMerged).toEqual(['accepted']);
  });

  it('lets a red gate go back to the proposer and be re-sent', () => {
    expect(canTransitionProposal('gating', 'needs_work')).toBe(true);
    expect(canTransitionProposal('needs_work', 'submitted')).toBe(true);
    // But not straight to the reviewer: the verdict on the manifest has to describe
    // the sources the reviewer is looking at.
    expect(canTransitionProposal('needs_work', 'in_review')).toBe(false);
  });

  it('lets an accepted proposal fall back if the owner never publishes', () => {
    expect(canTransitionProposal('accepted', 'in_review')).toBe(true);
    expect(canTransitionProposal('accepted', 'declined')).toBe(true);
  });

  it('refuses to drag a decided proposal backwards', () => {
    // Sweeps run on timers; a late one must not revive a finished proposal.
    for (const state of PROPOSAL_STATES) {
      if (!isTerminalProposal(state)) continue;
      const onwards = PROPOSAL_STATES.filter((to) => canTransitionProposal(state, to));
      expect(onwards).toEqual([]);
    }
  });

  it('lets the target moving under a proposal supersede it from any live state', () => {
    for (const state of PROPOSAL_STATES) {
      if (isTerminalProposal(state)) continue;
      expect(canTransitionProposal(state, 'superseded')).toBe(true);
    }
  });

  it('only expires proposals that are actually waiting on a reviewer', () => {
    // Expiry says "the game went quiet". A proposal the proposer still owes work on
    // is not waiting on anybody, and expiring it would blame the wrong person.
    const expirable = PROPOSAL_STATES.filter((from) => canTransitionProposal(from, 'expired'));
    expect(expirable.sort()).toEqual(['changes_requested', 'in_review']);
  });
});

describe('whose turn it is', () => {
  it('counts the states where the proposer can act', () => {
    const proposerTurn = PROPOSAL_STATES.filter(isProposerTurn).sort();
    expect(proposerTurn).toEqual(['changes_requested', 'draft', 'needs_work']);
  });
});

describe('open-proposal accounting', () => {
  it('counts everything undecided, including accepted-but-unpublished', () => {
    // An accepted proposal still occupies the owner's attention and our storage.
    expect(countsAsOpen('accepted')).toBe(true);
    expect(countsAsOpen('in_review')).toBe(true);
    expect(countsAsOpen('needs_work')).toBe(true);
  });

  it('stops counting once decided', () => {
    for (const state of PROPOSAL_STATES) {
      expect(countsAsOpen(state)).toBe(!isTerminalProposal(state));
    }
  });
});

describe('staleness', () => {
  it('is stale when the target published something else', () => {
    expect(isBaseStale('v1', 'v2')).toBe(true);
    expect(isBaseStale('v1', 'v1')).toBe(false);
  });

  it('is stale when the target is no longer published at all', () => {
    expect(isBaseStale('v1', undefined)).toBe(true);
  });

  it('treats a rollback as stale too', () => {
    // Compared by identity, not ordering: "the base is not what is live" is the
    // condition that matters, and a rollback makes it true going backwards.
    expect(isBaseStale('v2', 'v1')).toBe(true);
  });

  it('is never stale without a base — a repo-lane proposal pins a sha instead', () => {
    expect(isBaseStale(undefined, 'v2')).toBe(false);
  });
});

describe('decline reasons and statements of reasons', () => {
  it('separates moderation from taste', () => {
    expect(isModerationDecline('unsafe')).toBe(true);
    expect(isModerationDecline('infringing')).toBe(true);
    expect(isModerationDecline('not_the_direction')).toBe(false);
    expect(isModerationDecline('quality')).toBe(false);
    expect(isModerationDecline('duplicate')).toBe(false);
    expect(isModerationDecline('off_topic')).toBe(false);
  });

  it('owes a statement of reasons only for a platform moderation decline', () => {
    expect(owesStatementOfReasons({ reviewer: 'platform', reason: 'unsafe' })).toBe(true);
    // A creator declining their own game's proposal is exercising authorship, not
    // adjudicating content — that routes to the report path instead.
    expect(owesStatementOfReasons({ reviewer: 'creator', reason: 'unsafe' })).toBe(false);
    // Taste is never reportable, whoever holds it.
    expect(owesStatementOfReasons({ reviewer: 'platform', reason: 'quality' })).toBe(false);
  });

  it('classifies every declared reason', () => {
    for (const reason of DECLINE_REASONS) {
      expect(typeof isModerationDecline(reason)).toBe('boolean');
    }
  });
});

describe('exhaustiveness', () => {
  it('declares a transition row for every state', () => {
    // A missing row would throw at runtime on `.includes` rather than refusing cleanly.
    for (const from of PROPOSAL_STATES) {
      for (const to of PROPOSAL_STATES) {
        expect(() => canTransitionProposal(from as ProposalState, to as ProposalState)).not.toThrow();
      }
    }
  });
});
