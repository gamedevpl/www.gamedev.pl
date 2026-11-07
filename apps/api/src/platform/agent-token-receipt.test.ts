import { describe, expect, it } from 'vitest';
import { InMemoryStore } from '../store/in-memory.js';
import {
  classifyAgentTokenAccess,
  InvalidAgentTokenError,
  roundClosedFields,
  STALE_AGENT_TOKEN_REASON,
} from './agent-token.js';

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

  it('owns the preview a preview-only round delivered, not an older publish', async () => {
    const store = new InMemoryStore();
    await store.createSubmission(JOB, 'g:owner', 'Comet Courier');
    await store.setSubmissionDeliveredVersion(JOB, 'v-published');
    const generation = (await store.ensureRoundGeneration(JOB)) ?? 1;
    await store.setSubmissionPreviewVersion(JOB, 'v-preview');
    await store.incrementRoundDeliveryCount(JOB);
    await store.recordJobTransition(JOB, { to: 'ready_for_review', at: new Date().toISOString(), by: 'system' });
    expect((await store.getSubmission(JOB))?.receiptRound).toEqual({ generation, version: 'v-preview' });
  });

  it('is cleared by a revocation bump', async () => {
    const { store } = await closedJob();
    await store.bumpRoundGeneration(JOB);
    expect((await store.getSubmission(JOB))?.receiptRound).toBeUndefined();
  });
});

describe('a stale key says why its round closed', () => {
  const now = Date.now();
  const claims = { jobId: JOB, roundGeneration: 1, exp: Math.floor(now / 1000) + 3600 };

  function refusal(record: Parameters<typeof classifyAgentTokenAccess>[1], at = now) {
    try {
      classifyAgentTokenAccess(claims, record, at);
    } catch (error) {
      return roundClosedFields(error as InvalidAgentTokenError);
    }
    throw new Error('expected a refusal');
  }

  it('names the cause the store stamped for that generation', async () => {
    const store = new InMemoryStore();
    await store.createSubmission(JOB, 'g:owner', 'Comet Courier');
    await store.ensureRoundGeneration(JOB);
    await store.bumpRoundGeneration(JOB, 'credentials_revoked');
    const record = (await store.getSubmission(JOB))!;
    expect(record.roundClosed).toMatchObject({ generation: 1, reason: 'credentials_revoked' });
    expect(refusal(record)).toMatchObject({ code: 'round_closed', reason: 'credentials_revoked' });
  });

  it('carries the closing transition', async () => {
    const store = new InMemoryStore();
    await store.createSubmission(JOB, 'g:owner', 'Comet Courier');
    await store.ensureRoundGeneration(JOB);
    const at = new Date(now).toISOString();
    await store.recordJobTransition(JOB, { to: 'canceled', at, by: 'creator', reason: 'abandoned' });
    await store.bumpRoundGeneration(JOB);
    const twoBehind = (await store.getSubmission(JOB))!;
    expect(refusal(twoBehind)).toMatchObject({ reason: 'superseded' });
    const oneBehind = {
      ...twoBehind,
      roundGeneration: 2,
      roundClosed: { generation: 1, reason: 'creator_action' as const, at, detail: 'abandoned' },
    };
    expect(refusal(oneBehind)).toMatchObject({ reason: 'creator_action', closedAt: at, detail: 'abandoned' });
  });

  it('reports expiry apart from a close', () => {
    expect(refusal({ roundGeneration: 1 }, now + 2 * 3600 * 1000)).toMatchObject({ reason: 'expired' });
  });
});
