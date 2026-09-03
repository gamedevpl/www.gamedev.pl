import { afterEach, describe, expect, it, vi } from 'vitest';
import { fetchPublishedGame } from './fetchPublishedGame.js';

describe('fetchPublishedGame', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('streams the assembled document and reports download progress', async () => {
    const payload = JSON.stringify({ slug: 'solo-cards', title: 'Solo Cards', html: '<canvas></canvas>' });
    const encoded = new TextEncoder().encode(payload);
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(encoded.slice(0, 40));
        controller.enqueue(encoded.slice(40));
        controller.close();
      },
    });
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(stream, {
        headers: { 'content-length': String(encoded.byteLength), 'content-type': 'application/json' },
      }),
    );
    const updates: Array<{ loaded: number; total: number | null }> = [];

    await expect(
      fetchPublishedGame('solo-cards', { onProgress: (progress) => updates.push(progress) }),
    ).resolves.toEqual({
      slug: 'solo-cards',
      title: 'Solo Cards',
      html: '<canvas></canvas>',
    });
    expect(updates[0]?.loaded).toBe(40);
    expect(updates.at(-1)).toEqual({ loaded: encoded.byteLength, total: encoded.byteLength });
    expect(globalThis.fetch).toHaveBeenCalledWith('/api/games/solo-cards', {
      credentials: 'include',
    });
  });

  it('surfaces the API error body when the game request fails', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ error: 'game snapshot incomplete' }), { status: 502, statusText: '' }),
    );
    await expect(fetchPublishedGame('missing')).rejects.toMatchObject({
      message: 'game snapshot incomplete',
      status: 502,
    });
  });
});
