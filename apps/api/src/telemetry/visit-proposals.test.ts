import { describe, expect, it } from 'vitest';
import { summarizeProposals } from './visit-proposals.js';
import type { VisitEvent } from '../platform/store.js';

function step(visitId: string, stepName: string, builder?: string): VisitEvent {
  return {
    id: `${visitId}:${stepName}`,
    visitId,
    type: 'studio_step',
    step: stepName,
    createdAt: '2026-09-07T12:00:00.000Z',
    ...(builder ? { builder } : {}),
  } as VisitEvent;
}

describe('summarizeProposals', () => {
  it('counts decisions per exposure and splits them by the builder that drew the card', () => {
    const read = summarizeProposals([
      step('v1', 'proposal_shown', 'platform'),
      step('v1', 'proposal_picked', 'platform'),
      step('v2', 'proposal_shown', 'platform'),
      step('v2', 'proposal_postponed', 'platform'),
      step('v3', 'proposal_shown', 'self'),
      step('v3', 'proposal_muted', 'self'),
    ]);

    expect(read).toMatchObject({ exposed: 3, picked: 1, postponed: 1, muted: 1 });
    expect(read.byBuilder).toEqual([
      { builder: 'platform', exposed: 2, picked: 1, postponed: 1, muted: 0 },
      { builder: 'self', exposed: 1, picked: 0, postponed: 0, muted: 1 },
    ]);
  });

  it('ignores a decision whose exposure never arrived, so no ratio exceeds one', () => {
    // Both rungs travel in best-effort batches; the first can be lost.
    const read = summarizeProposals([step('v1', 'proposal_shown', 'self'), step('v2', 'proposal_picked', 'self')]);

    expect(read.exposed).toBe(1);
    expect(read.picked).toBe(0);
  });

  it('names a missing builder rather than guessing one', () => {
    const read = summarizeProposals([step('v1', 'proposal_shown'), step('v1', 'proposal_picked')]);

    expect(read.byBuilder).toEqual([
      { builder: 'platform', exposed: 0, picked: 0, postponed: 0, muted: 0 },
      { builder: 'self', exposed: 0, picked: 0, postponed: 0, muted: 0 },
      { builder: 'unknown', exposed: 1, picked: 1, postponed: 0, muted: 0 },
    ]);
  });

  it('reads nothing from the other studio rungs', () => {
    expect(
      summarizeProposals([step('v1', 'agent_signaled', 'self'), step('v1', 'gate_verdict', 'self')]),
    ).toMatchObject({
      exposed: 0,
      picked: 0,
    });
  });

  it('counts one exposure per visit, however many cards it saw', () => {
    const read = summarizeProposals([
      step('v1', 'proposal_shown', 'platform'),
      step('v1', 'proposal_shown', 'platform'),
      step('v1', 'proposal_picked', 'platform'),
      step('v1', 'proposal_picked', 'platform'),
    ]);

    expect(read).toMatchObject({ exposed: 1, picked: 1 });
  });
});
