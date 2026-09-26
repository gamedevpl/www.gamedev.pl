// @vitest-environment jsdom

import { afterEach, describe, expect, it, vi } from 'vitest';
import { getChannelPlayable, getSubmissionStatus, submitSpec } from './submissionApi.js';

describe('submissionApi', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('gives a channel preview its no-network CSP before any of its own markup', async () => {
    const hostile = '<!doctype html><script>fetch("https://evil.example")</script><html><head></head></html>';
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(hostile));

    const html = await getChannelPlayable('abc123', { ref: 'p1' });
    const doc = new DOMParser().parseFromString(html, 'text/html');
    const first = doc.head.firstElementChild;
    expect(first?.getAttribute('http-equiv')).toBe('Content-Security-Policy');
    expect(first?.getAttribute('content')).toContain("connect-src 'none'");
    expect(first?.getAttribute('content')).toContain("default-src 'none'");
    expect(html.indexOf('Content-Security-Policy')).toBeLessThan(html.indexOf('<script>'));
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
