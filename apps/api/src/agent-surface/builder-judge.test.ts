import { afterEach, describe, expect, it, vi } from 'vitest';
import { judgeVisuals } from '../../scripts/builder-judge.js';

const input = {
  apiKey: 'fixture',
  creatorKey: 'fixture',
  mcpUrl: 'https://mcp.example.test',
  sessionKey: 'session-1',
  brief: 'A night bus',
};

function gateMedia(deliveryId: string) {
  return Response.json({
    result: {
      structuredContent: {
        deliveryId,
        screenshots: [{ file: 'opening.png', url: 'https://frames.example.test/opening.png' }],
      },
    },
  });
}

afterEach(() => vi.unstubAllGlobals());

describe('visual score delivery', () => {
  it.each([undefined, '', '   '])('skips all network requests without a recorded delivery (%j)', async (deliveryId) => {
    const fetch = vi.fn();
    vi.stubGlobal('fetch', fetch);

    await expect(judgeVisuals({ ...input, deliveryId })).rejects.toThrow(/deliveryId/);
    expect(fetch).not.toHaveBeenCalled();
  });

  it('requests the recorded delivery and rejects frames from a later one', async () => {
    const fetch = vi.fn<typeof globalThis.fetch>().mockResolvedValueOnce(gateMedia('v2'));
    vi.stubGlobal('fetch', fetch);

    await expect(judgeVisuals({ ...input, deliveryId: 'v1' })).rejects.toThrow('gate media is for v2, not v1');
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(JSON.parse(String(fetch.mock.calls[0]?.[1]?.body)).params).toEqual({
      name: 'get_gate_media',
      arguments: { sessionKey: 'session-1', deliveryId: 'v1' },
    });
  });

  it('scores frames from the recorded delivery', async () => {
    const verdict = { readability: 4, art: 4, scene: 4, cohesion: 4, fidelity: 4 };
    const fetch = vi
      .fn<typeof globalThis.fetch>()
      .mockResolvedValueOnce(gateMedia('v1'))
      .mockResolvedValueOnce(new Response('frame'))
      .mockResolvedValueOnce(Response.json({ content: [{ type: 'text', text: JSON.stringify(verdict) }] }));
    vi.stubGlobal('fetch', fetch);

    await expect(judgeVisuals({ ...input, deliveryId: 'v1' })).resolves.toMatchObject({
      overall: 4,
      frames: ['opening.png'],
    });
  });
});
