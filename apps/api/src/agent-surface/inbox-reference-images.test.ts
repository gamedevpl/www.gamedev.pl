import type { FastifyRequest } from 'fastify';
import { describe, expect, it, vi } from 'vitest';
import { inboxReferenceImages, referenceShotIds } from './inbox-reference-images.js';

// The shape playtest-context.ts appends to a message with pictures.
const picked = {
  text: 'Implement an off-map artillery strike.\n\n```text\nreferenceImageShotIds: shot-a, shot-b\n```',
};

function channel(statusCode = 200) {
  return vi.fn(async (_request: FastifyRequest, _method: 'GET', _path: string, _token: string) => ({
    statusCode,
    json: () => ({
      images: ['shot-a', 'shot-b', 'shot-old'].map((id) => ({
        id,
        url: `https://www.gamedev.pl/dl?t=${id}`,
        expiresAt: '2026-10-07T11:00:00.000Z',
      })),
    }),
  }));
}

const request = {} as FastifyRequest;

describe('inbox reference images', () => {
  it('reads every id a message names, once', () => {
    expect(referenceShotIds([picked, { text: 'plain' }, picked])).toEqual(['shot-a', 'shot-b']);
  });

  it('returns download URLs for only the images the pending messages name', async () => {
    const injectChannel = channel();
    const images = await inboxReferenceImages([picked], { request, channelToken: 't', injectChannel });
    expect(injectChannel.mock.calls[0]?.[2]).toMatch(/\?urls=1$/);
    expect(images.map((image) => image.url)).toEqual([
      'https://www.gamedev.pl/dl?t=shot-a',
      'https://www.gamedev.pl/dl?t=shot-b',
    ]);
  });

  it('fetches nothing for messages without pictures', async () => {
    const injectChannel = channel();
    expect(await inboxReferenceImages([{ text: 'plain' }], { request, channelToken: 't', injectChannel })).toEqual([]);
    expect(injectChannel).not.toHaveBeenCalled();
  });

  it('answers with no images when the listing fails', async () => {
    expect(await inboxReferenceImages([picked], { request, channelToken: 't', injectChannel: channel(429) })).toEqual(
      [],
    );
  });
});
