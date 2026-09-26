import { describe, expect, it } from 'vitest';
import { InMemoryStore } from '../store/in-memory.js';
import { classifyAgentTokenAccess, STALE_AGENT_TOKEN_REASON } from './agent-token.js';

const JOB = 4242;

describe('classifyAgentTokenAccess (terminal receipt)', () => {
  const now = Date.now();
  const claims = { jobId: JOB, roundGeneration: 1, exp: Math.floor(now / 1000) + 3600 };

  it('returns terminal_receipt only for a round a transition closed', () => {
    const closed = { roundGeneration: 2, receiptRound: { generation: 1 } };
    expect(classifyAgentTokenAccess(claims, closed, now)).toBe('terminal_receipt');
    expect(classifyAgentTokenAccess(claims, { roundGeneration: 1 }, now)).toBe('active');
    expect(() => classifyAgentTokenAccess(claims, { roundGeneration: 3 }, now)).toThrow(STALE_AGENT_TOKEN_REASON);
  });

  // A revocation bump leaves no receipt, so the revoked key reads nothing.
  it('refuses a key one behind when that round was revoked, not closed', () => {
    expect(() => classifyAgentTokenAccess(claims, { roundGeneration: 2 }, now)).toThrow(STALE_AGENT_TOKEN_REASON);
    const other = { roundGeneration: 2, receiptRound: { generation: 0 } };
    expect(() => classifyAgentTokenAccess(claims, other, now)).toThrow(STALE_AGENT_TOKEN_REASON);
  });
});

describe('receiptRound bookkeeping', () => {
  async function closedJob(): Promise<{ store: InMemoryStore; generation: number }> {
    const store = new InMemoryStore();
    await store.createSubmission(JOB, 'g:owner', 'Comet Courier');
    await store.setSubmissionSlug(JOB, 'comet-courier');
    const generation = (await store.ensureRoundGeneration(JOB)) ?? 1;
    await store.setSubmissionDeliveredVersion(JOB, 'v-closed');
    const at = new Date().toISOString();
    expect(await store.recordJobTransition(JOB, { to: 'ready_for_review', at, by: 'system' })).toBe(true);
    return { store, generation };
  }

  it('is stamped by a round-closing transition with the closing delivery', async () => {
    const { store, generation } = await closedJob();
    const record = await store.getSubmission(JOB);
    expect(record?.roundGeneration).toBe(generation + 1);
    expect(record?.receiptRound).toEqual({ generation, version: 'v-closed' });
  });

  it('is cleared by a revocation bump', async () => {
    const { store } = await closedJob();
    await store.bumpRoundGeneration(JOB);
    expect((await store.getSubmission(JOB))?.receiptRound).toBeUndefined();
  });
});
