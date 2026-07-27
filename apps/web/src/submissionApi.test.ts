import { afterEach, describe, expect, it, vi } from 'vitest';
import { getSubmissionStatus, submitSpec } from './submissionApi.js';

describe('submissionApi', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('submits a spec and returns the tracking payload', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ token: 'abc123', statusUrl: 'https://www.gamedev.pl/status/abc123' })),
    );

    await expect(
      submitSpec({ title: 'Sky Dodge', concept: 'Dodge asteroids for as long as possible in a neon sky.' }),
    ).resolves.toEqual({
      token: 'abc123',
      statusUrl: 'https://www.gamedev.pl/status/abc123',
    });
  });

  it('gets the submission status payload', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ status: 'published', slug: 'sky-dodge', playUrl: 'https://example.com/game' })),
    );

    await expect(getSubmissionStatus('abc123')).resolves.toEqual({
      status: 'published',
      slug: 'sky-dodge',
      playUrl: 'https://example.com/game',
    });
  });

  it('surfaces the server error message on non-ok responses', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ error: 'Too many submissions from this IP.' }), { status: 429 }),
    );

    await expect(
      submitSpec({ title: 'Sky Dodge', concept: 'Dodge asteroids for as long as possible in a neon sky.' }),
    ).rejects.toThrow('Too many submissions from this IP.');
  });
});
