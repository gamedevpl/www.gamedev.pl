import type { FastifyRequest } from 'fastify';
import { describe, expect, it, vi } from 'vitest';
import { attachInboxReferenceImages, referenceShotIds } from './inbox-reference-images.js';
import { toolOk } from './mcp-tool-support.js';

// The shape playtest-context.ts appends to a message with pictures.
const picked = {
  text: 'Implement an off-map artillery strike.\n\n```text\nreferenceImageShotIds: shot-a, shot-b\n```',
};

function channel(statusCode = 200) {
  return vi.fn(async () => ({
    statusCode,
    json: () => ({
      images: [
        { id: 'shot-a', png: 'QUFB' },
        { id: 'shot-b', png: 'QkJC' },
        { id: 'shot-old', png: 'T0xE' },
      ],
    }),
  }));
}

const request = {} as FastifyRequest;

describe('inbox reference images', () => {
  it('reads every id a message names, once', () => {
    expect(referenceShotIds([picked, { text: 'plain' }, picked])).toEqual(['shot-a', 'shot-b']);
  });

  it('attaches only the images the pending messages name', async () => {
    const injectChannel = channel();
    const result = await attachInboxReferenceImages(toolOk({ messages: [picked] }), [picked], {
      request,
      channelToken: 't',
      injectChannel,
    });
    expect(result.content.slice(1)).toEqual([
      { type: 'image', data: 'QUFB', mimeType: 'image/png' },
      { type: 'image', data: 'QkJC', mimeType: 'image/png' },
    ]);
  });

  it('fetches nothing for messages without pictures', async () => {
    const injectChannel = channel();
    const result = await attachInboxReferenceImages(toolOk({}), [{ text: 'plain' }], {
      request,
      channelToken: 't',
      injectChannel,
    });
    expect(injectChannel).not.toHaveBeenCalled();
    expect(result.content).toHaveLength(1);
  });

  it('keeps the text answer when the image read fails', async () => {
    const result = await attachInboxReferenceImages(toolOk({}), [picked], {
      request,
      channelToken: 't',
      injectChannel: channel(429),
    });
    expect(result.content).toHaveLength(1);
  });
});
