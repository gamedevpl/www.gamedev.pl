import { readFileSync } from 'node:fs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { activityEvidence, activityExcerpt } from './managed-activity-evidence.js';
import { summarizeActivity } from './managed-activity-summary.js';
import { createAnthropicActivityReader } from './managed-anthropic-activity.js';

const at = '2026-11-17T10:00:00.000Z';
const tool = (
  id = 'one',
  time = at,
  input: Record<string, string> = { path: 'game/terrain.ts', content: 'function destroyTerrain() {}' },
) => ({ id, processed_at: time, type: 'agent.tool_use', name: 'write', input });
const summary = { at, en: 'The agent edited terrain destruction.', pl: 'Agent zmienił niszczenie terenu.' };
const config = (fetchImpl: typeof fetch) => ({ apiKey: 'test-key', model: 'builder-model', fetchImpl });
beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date(at));
  vi.spyOn(console, 'info').mockImplementation(() => {});
});
afterEach(() => {
  vi.restoreAllMocks();
  vi.useRealTimers();
});

describe('activity evidence', () => {
  it('redacts credentials and excludes private files, MCP payloads and thinking', () => {
    const events = [
      tool('one', at, {
        command: 'API_KEY="SECRET_VALUE" node test.js; curl https://host/?token=HIDDEN',
        content: 'Bearer PRIVATE_BEARER',
      }),
      tool('private', at, { path: '/workspace/.env.production', content: 'PRIVATE_FILE' }),
      {
        id: 'result',
        processed_at: at,
        type: 'agent.tool_result',
        tool_use_id: 'private',
        content: [{ type: 'text', text: 'PRIVATE_RESULT' }],
      },
      { ...tool('mcp'), type: 'agent.mcp_tool_use', input: { key: 'PRIVATE_MCP' } },
      { ...tool('thinking'), type: 'agent.thinking', content: 'PRIVATE_THINKING' },
    ];
    const evidence = activityEvidence(events);
    expect(evidence).toHaveLength(2);
    const encoded = JSON.stringify(evidence);
    for (const secret of [
      'SECRET_VALUE',
      'HIDDEN',
      'PRIVATE_BEARER',
      'PRIVATE_FILE',
      'PRIVATE_RESULT',
      'PRIVATE_MCP',
      'PRIVATE_THINKING',
    ])
      expect(encoded).not.toContain(secret);
    expect(encoded).toContain('node test.js');
    expect(encoded).toContain('[redacted]');
  });

  it('bounds input and discards old rounds, unmatched results and future events', () => {
    const events = Array.from({ length: 25 }, (_, i) => tool(String(i), at, { content: 'x'.repeat(10000) }));
    events.push(tool('old', '2026-11-17T09:00:00Z'), tool('future', '2026-11-17T11:00:00Z'));
    const evidence = activityEvidence(events, '2026-11-17T09:59:59Z');
    expect(evidence.length).toBeLessThanOrEqual(12);
    expect(JSON.stringify(evidence).length).toBeLessThanOrEqual(8000);
    expect(evidence.some((e) => ['old', 'future'].includes(e.id))).toBe(false);
    expect(
      activityEvidence([{ id: 'r', processed_at: at, type: 'agent.tool_result', tool_use_id: 'missing' }]),
    ).toEqual([]);
  });
});

describe('Haiku summaries', () => {
  it('uses low-cost Haiku once for both languages and preserves evidence time', async () => {
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(
      Response.json({
        stop_reason: 'end_turn',
        content: [{ type: 'text', text: JSON.stringify({ en: summary.en, pl: summary.pl, evidence_ids: ['one'] }) }],
        usage: { input_tokens: 100, output_tokens: 30 },
      }),
    );
    expect(await summarizeActivity(config(fetchImpl), activityEvidence([tool()]))).toEqual(summary);
    const request = JSON.parse(String(fetchImpl.mock.calls[0][1]?.body));
    expect(request).toMatchObject({
      model: 'claude-haiku-5-5',
      thinking: { type: 'disabled' },
      output_config: {
        effort: 'low',
        format: {
          type: 'json_schema',
          schema: { additionalProperties: false, required: ['en', 'pl', 'evidence_ids'] },
        },
      },
      max_tokens: 512,
    });
    expect(request.system).toContain('untrusted data');
    expect(request.system).toContain('attempt, not success');
    expect(fetchImpl.mock.calls[0][1]?.signal).toBeInstanceOf(AbortSignal);
    expect(console.info).toHaveBeenCalledWith(expect.stringContaining('"inputTokens":100'));
    expect(String(vi.mocked(console.info).mock.calls)).not.toContain('terrain');
    const log = JSON.parse(String(vi.mocked(console.info).mock.calls[0][0]));
    const monitoring = readFileSync(new URL('../../../../infra/setup-monitoring.sh', import.meta.url), 'utf8');
    expect(monitoring).toContain('ensure_log_metric managed_activity_summary_calls');
    expect(monitoring).toContain(`jsonPayload.msg=\\"${log.msg}\\"`);
  });

  it.each([
    { stop_reason: 'max_tokens', content: [] },
    { stop_reason: 'end_turn', content: [{ type: 'text', text: 'not json' }] },
    {
      stop_reason: 'end_turn',
      content: [{ type: 'text', text: JSON.stringify({ en: 'Done', pl: 'Gotowe', evidence_ids: ['invented'] }) }],
    },
  ])('discards incomplete or unsupported model output', async (body) => {
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(Response.json(body));
    expect(await summarizeActivity(config(fetchImpl), activityEvidence([tool()]))).toBeNull();
  });
});

describe('shared summary cadence', () => {
  it('coalesces viewers, consumes failures and summarizes only new evidence every 30 seconds', async () => {
    let events = [tool()];
    const fetchImpl = vi.fn<typeof fetch>().mockImplementation(async () => Response.json({ data: events }));
    const summarize = vi.fn().mockResolvedValueOnce(summary).mockResolvedValue(null);
    const read = createAnthropicActivityReader(config(fetchImpl), summarize);
    const [a, b] = await Promise.all([read('session'), read('session')]);
    await vi.advanceTimersByTimeAsync(0);
    expect((await read('session'))?.summary).toEqual(summary);
    expect(b).toEqual(a);
    expect(summarize).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(10_000);
    events = [tool('two', new Date().toISOString())];
    const next = await read('session');
    expect(next?.at).not.toBe(summary.at);
    expect(next?.summary?.at).toBe(summary.at);
    expect(summarize).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(20_001);
    await read('session');
    expect(summarize).toHaveBeenCalledTimes(2);
    await vi.advanceTimersByTimeAsync(30_001);
    await read('session');
    expect(summarize).toHaveBeenCalledTimes(2);
    expect((await read('session', new Date().toISOString()))?.summary).toBeUndefined();
    expect(summarize).toHaveBeenCalledTimes(2);
  });

  it('returns status before Haiku resolves and exposes completion on the next cached poll', async () => {
    let finish!: (value: typeof summary) => void;
    const summarize = vi.fn().mockImplementation(
      () =>
        new Promise((resolve) => {
          finish = resolve;
        }),
    );
    let events: unknown[] = [tool()];
    const fetchImpl = vi.fn<typeof fetch>().mockImplementation(async () => Response.json({ data: events }));
    const read = createAnthropicActivityReader(config(fetchImpl), summarize);
    expect(await read('session')).toEqual({ at, key: 'managed_editing_files' });
    expect(await read('session')).toEqual({ at, key: 'managed_editing_files' });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(31_000);
    events = [tool('two', new Date().toISOString())];
    expect((await read('session'))?.summary).toBeUndefined();
    expect(summarize).toHaveBeenCalledTimes(1);
    finish(summary);
    await vi.advanceTimersByTimeAsync(0);
    expect((await read('session'))?.summary).toEqual(summary);
    expect(fetchImpl).toHaveBeenCalledTimes(2);
    events = [{ ...tool('idle', new Date().toISOString()), type: 'session.status_idle' }, tool()];
    await vi.advanceTimersByTimeAsync(5001);
    expect((await read('session'))?.summary).toBeUndefined();
    expect(summarize).toHaveBeenCalledTimes(1);
  });

  it('retains attempt history when refreshing a full cache', async () => {
    const fetchImpl = vi.fn<typeof fetch>().mockImplementation(async () => Response.json({ data: [tool()] }));
    const summarize = vi.fn().mockResolvedValue(null);
    const read = createAnthropicActivityReader(config(fetchImpl), summarize);
    for (let i = 0; i < 256; i++) await read(String(i));
    await vi.advanceTimersByTimeAsync(6000);
    await read('255');
    await read('0');
    expect(summarize).toHaveBeenCalledTimes(256);
  });

  it('keeps activity available after a background rejection without retrying consumed evidence', async () => {
    const fetchImpl = vi.fn<typeof fetch>().mockImplementation(async () => Response.json({ data: [tool()] }));
    const summarize = vi.fn().mockRejectedValue(new Error('unavailable'));
    const read = createAnthropicActivityReader(config(fetchImpl), summarize);
    expect((await read('session'))?.key).toBe('managed_editing_files');
    await vi.advanceTimersByTimeAsync(31_000);
    expect((await read('session'))?.key).toBe('managed_editing_files');
    expect(summarize).toHaveBeenCalledTimes(1);
  });
});

it('redacts bare platform capabilities and the staging header before truncation', () => {
  for (const value of ['mcp2_Abcdef0123456789.Signature0123456789', 'member1_Abcdef0123456789']) {
    expect(activityExcerpt(`KEY=${value} node s.js`)).toBe('KEY=[redacted] node s.js');
    expect(activityExcerpt(value, 8)).toBe('[redacte');
  }
  expect(activityExcerpt('curl -H "x-gamedev-stage: abc123456789"')).not.toContain('abc123456789');
});

it.each([
  [Response.json({}, { status: 429 }), 'http_error'],
  [Response.json({ stop_reason: 'refusal' }), 'refusal'],
  [Response.json({ stop_reason: 'max_tokens' }), 'incomplete'],
  [Response.json({ stop_reason: 'end_turn', content: [{ type: 'text', text: '```json\n{}\n```' }] }), 'invalid_json'],
  [
    Response.json({
      stop_reason: 'end_turn',
      content: [{ type: 'text', text: '{"en":"","pl":"","evidence_ids":[]}' }],
    }),
    'insufficient_evidence',
  ],
])('distinguishes model failure outcomes without logging payloads', async (response, outcome) => {
  const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(response);
  expect(await summarizeActivity(config(fetchImpl), activityEvidence([tool()]))).toBeNull();
  expect(console.info).toHaveBeenCalledWith(expect.stringContaining(`"outcome":"${outcome}"`));
});
