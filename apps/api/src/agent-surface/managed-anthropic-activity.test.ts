import { afterEach, describe, expect, it, vi } from 'vitest';
import { createAnthropicActivityReader, managedActivityFromEvent } from './managed-anthropic-activity.js';

const at = '2026-11-17T10:00:00Z';
const event = (name = 'write') => ({
  id: 'event',
  type: 'agent.tool_use',
  name,
  processed_at: at,
  input: { secret: 'PRIVATE' },
});
afterEach(() => vi.useRealTimers());

describe('managed activity through status polling', () => {
  it('projects a closed vocabulary without arguments, output or reasoning', () => {
    expect(managedActivityFromEvent(event())).toEqual({ at, key: 'managed_editing_files' });
    expect(managedActivityFromEvent(event('bash'))?.key).toBe('managed_running_commands');
    expect(managedActivityFromEvent(event('read'))?.key).toBe('managed_reading_files');
    expect(managedActivityFromEvent(event('PRIVATE'))?.key).toBe('managed_using_tools');
    expect(managedActivityFromEvent({ ...event(), type: 'agent.thinking' })).toBeNull();
    expect(managedActivityFromEvent({ ...event(), type: 'session.error' })).toBeNull();
    expect(managedActivityFromEvent({ ...event(), type: 'session.status_terminated' })?.key).toBe('managed_ended');
    expect(managedActivityFromEvent({ ...event(), type: 'agent.tool_result', content: 'PRIVATE' })).toEqual({
      at,
      key: 'managed_working',
    });
    expect(managedActivityFromEvent({ ...event(), processed_at: 'bad' })).toBeNull();
    expect(managedActivityFromEvent({ ...event(), type: 'session.status_idle' })?.key).toBe('managed_idle');
  });

  it.each([
    ['budget_reached', 'managed_ended'],
    ['retries_exhausted', 'managed_ended'],
    ['end_turn', 'managed_idle'],
    ['requires_action', 'managed_idle'],
  ])('projects idle reason %s as %s', (type, key) => {
    expect(managedActivityFromEvent({ ...event(), type: 'session.status_idle', stop_reason: { type } })?.key).toBe(key);
  });

  it('reads only the latest relevant event and shares concurrent and cached reads', async () => {
    vi.useFakeTimers();
    const fetchImpl = vi.fn<typeof fetch>().mockImplementation(async () => Response.json({ data: [event()] }));
    const read = createAnthropicActivityReader({ apiKey: 'test-key', model: 'test', fetchImpl }, async () => null);
    const result = await Promise.all([read('session/a'), read('session/a')]);
    expect(result).toEqual([
      { at, key: 'managed_editing_files' },
      { at, key: 'managed_editing_files' },
    ]);
    await read('session/a');
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    const url = new URL(String(fetchImpl.mock.calls[0][0]));
    expect(url.pathname).toBe('/v1/sessions/session%2Fa/events');
    expect(url.searchParams.get('order')).toBe('desc');
    expect(url.searchParams.get('limit')).toBe('20');
    expect(url.searchParams.getAll('types[]')).toContain('agent.tool_use');
    expect(url.searchParams.getAll('types[]')).not.toContain('session.error');
    expect(JSON.stringify(result)).not.toContain('PRIVATE');
    expect(url.href).not.toContain('test-key');
    vi.advanceTimersByTime(5001);
    await read('session/a');
    await read('different-session');
    expect(fetchImpl).toHaveBeenCalledTimes(3);
  });

  it('treats upstream errors as missing activity and retries after the cache expires', async () => {
    vi.useFakeTimers();
    const fetchImpl = vi
      .fn<typeof fetch>()
      .mockRejectedValueOnce(new Error('offline'))
      .mockResolvedValueOnce(new Response('', { status: 503 }))
      .mockResolvedValueOnce(Response.json({ data: [event('read')] }));
    const read = createAnthropicActivityReader({ apiKey: 'test-key', model: 'test', fetchImpl }, async () => null);
    expect(await read('session')).toBeNull();
    vi.advanceTimersByTime(5001);
    expect(await read('session')).toBeNull();
    vi.advanceTimersByTime(5001);
    expect((await read('session'))?.key).toBe('managed_reading_files');
  });
});
