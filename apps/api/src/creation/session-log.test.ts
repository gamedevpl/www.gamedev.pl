import { describe, expect, it } from 'vitest';
import { buildSessionLog } from './session-log.js';
import type { JobCostEntry, SubmissionRecord } from '../platform/store.js';

function record(overrides: Partial<SubmissionRecord> & { jobId: number }): SubmissionRecord {
  return { ownerUid: 'g:1', title: 'A game', createdAt: '2026-07-30T09:00:00Z', ...overrides };
}

describe('buildSessionLog', () => {
  it('reports how long a settled session ran', () => {
    const entry: JobCostEntry = {
      kind: 'agent_session',
      at: '2026-07-30T10:00:00Z',
      by: 'copilot',
      ref: 'task-1',
      finishedAt: '2026-07-30T10:12:00Z',
      state: 'completed',
    };

    const [row] = buildSessionLog([record({ jobId: 1, costs: [entry] })], 10);

    expect(row.durationMs).toBe(12 * 60_000);
    expect(row.state).toBe('completed');
  });

  it('leaves duration absent for a session with no recorded finish', () => {
    const entry: JobCostEntry = { kind: 'agent_session', at: '2026-07-30T10:00:00Z', by: 'copilot', ref: 'task-1' };

    const [row] = buildSessionLog([record({ jobId: 1, costs: [entry] })], 10);

    expect(row.durationMs).toBeUndefined();
    expect(row.finishedAt).toBeUndefined();
  });

  it('ignores gate runs, seeds and concept calls: only agent_session rows are sessions', () => {
    const costs: JobCostEntry[] = [
      { kind: 'gate_run', at: '2026-07-30T10:00:00Z', by: 'cloud-build' },
      { kind: 'concept', at: '2026-07-30T10:00:00Z', by: 'gemini-3.7-flash' },
      { kind: 'agent_session', at: '2026-07-30T10:00:00Z', by: 'copilot', ref: 'task-1' },
    ];

    const rows = buildSessionLog([record({ jobId: 1, costs })], 10);

    expect(rows).toHaveLength(1);
    expect(rows[0].ref).toBe('task-1');
  });

  it('sorts newest first and caps at the given limit', () => {
    const records = [1, 2, 3].map((n) =>
      record({
        jobId: n,
        costs: [{ kind: 'agent_session', at: `2026-07-30T1${n}:00:00Z`, by: 'copilot', ref: `task-${n}` }],
      }),
    );

    const rows = buildSessionLog(records, 2);

    expect(rows.map((row) => row.ref)).toEqual(['task-3', 'task-2']);
  });

  it('prices a token-billed session and flags it as a bound', () => {
    const entry: JobCostEntry = {
      kind: 'agent_session',
      at: '2026-07-30T10:00:00Z',
      by: 'claude-sonnet-5',
      ref: 'task-1',
      tokens: { input: 1_000_000, output: 100_000 },
    };

    const [row] = buildSessionLog([record({ jobId: 1, costs: [entry] })], 10);

    expect(row.usd).toBe(4.5);
    expect(row.usdBounded).toBe(true);
    expect(row.model).toBe('claude-sonnet-5');
  });

  it('does not price a session already billed in credits', () => {
    const entry: JobCostEntry = {
      kind: 'agent_session',
      at: '2026-07-30T10:00:00Z',
      by: 'copilot',
      ref: 'task-1',
      credits: 100,
      creditsMeasured: true,
      tokens: { input: 1_000_000, output: 100_000, model: 'claude-sonnet-5' },
    };

    const [row] = buildSessionLog([record({ jobId: 1, costs: [entry] })], 10);

    expect(row.usd).toBeUndefined();
    expect(row.credits).toBe(100);
  });
});
