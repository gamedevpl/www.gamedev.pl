import { describe, expect, it, vi } from 'vitest';
import { createCliTelemetry } from './telemetry.js';

describe('CLI delegation telemetry', () => {
  it('sends anonymous bounded dimensions using an ephemeral session identifier', async () => {
    const send = vi.fn<typeof fetch>(async () => new Response('{}'));
    const telemetry = createCliTelemetry('https://example.test', send);
    telemetry.record('delegate_offered', { adapter: 'copilot' });
    telemetry.record('delegate_used', { adapter: '/home/private/custom-agent' });
    await telemetry.flush();
    const events = send.mock.calls.map((call) => JSON.parse(String((call[1] as RequestInit).body)));
    expect(events[0].visitId).toBe(events[1].visitId);
    expect(events[1].events[0].adapter).toBe('custom');
    expect(JSON.stringify(events)).not.toContain('/home/private');
    expect(send.mock.calls[0]?.[1]).toMatchObject({ headers: { 'content-type': 'application/json' } });
    const next = createCliTelemetry('https://example.test', send);
    next.record('delegate_used', { adapter: 'claude' });
    await next.flush();
    expect(JSON.parse(String(send.mock.calls[2]?.[1]?.body)).visitId).not.toBe(events[0].visitId);
  });

  it('ignores telemetry failures', async () => {
    const telemetry = createCliTelemetry('https://example.test', async () => {
      throw new Error('offline');
    });
    telemetry.record('delegate_used', { adapter: 'agy' });
    await expect(telemetry.flush()).resolves.toBeUndefined();
  });
});
