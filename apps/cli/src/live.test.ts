import { describe, expect, it } from 'vitest';
import { createLiveScreen, renderLive } from './live.js';
import {
  formatStatusLines,
  formatStatusEvent,
  runStatusVerb,
  shouldAnnounceStatus,
  statusWatchDelayMs,
} from './status-watch.js';
import { createApi } from './api.js';
import { memoryStore } from './keychain.js';
import { EXIT_GREEN, EXIT_RED } from './exit-codes.js';

describe('live screen', () => {
  it('truncates live lines to the terminal width', () => {
    expect(renderLive(['abcdefghij'], 6)).toBe('abcde…');
    expect(renderLive(['abcdefghij'], 1)).toBe('a');
  });

  it('reads stdout.columns on each paint when width is not fixed', () => {
    const chunks: string[] = [];
    const stdout = { write: (s: string) => (chunks.push(s), true), columns: 4 } as unknown as NodeJS.WriteStream;
    const screen = createLiveScreen(stdout);
    screen.paint(['abcdefghij']);
    stdout.columns = 8;
    screen.paint(['abcdefghij']);
    expect(chunks[0]).toBe('abc…\n');
    expect(chunks[1]).toContain('abcdefg…');
  });

  it('repaints by moving the cursor up, never rewriting older rows', () => {
    const chunks: string[] = [];
    const stdout = { write: (s: string) => (chunks.push(s), true) } as unknown as NodeJS.WritableStream;
    const screen = createLiveScreen(stdout, 40);
    screen.paint(['building']);
    screen.paint(['building', 'smoke 1/4']);
    expect(chunks[0]).toBe('building\n');
    expect(chunks[1]).toBe('\x1b[1A\x1b[Jbuilding\nsmoke 1/4\n');
  });
});

describe('status watch', () => {
  it('uses the Studio cadence, not homemade backoff', () => {
    expect(statusWatchDelayMs({ status: 'building' })).toBe(3000);
    expect(statusWatchDelayMs({ status: 'needs_changes' })).toBe(10_000);
    expect(statusWatchDelayMs({ status: 'queued', stall: 'quiet' })).toBe(3000);
  });

  it('formats gate progress onto the live block', () => {
    expect(
      formatStatusLines(
        { status: 'building', gateProgress: { stage: 'smoke', index: 1, total: 4 }, preview: { slug: 'sky' } },
        'https://www.gamedev.pl',
      ),
    ).toEqual(['building', 'smoke 1/4', 'https://www.gamedev.pl/play/sky']);
  });

  it('strips control sequences from failure.reason', () => {
    const esc = String.fromCharCode(27);
    expect(
      formatStatusLines(
        { status: 'needs_changes', failure: { reason: `${esc}[31mred${esc}[0m` } },
        'https://www.gamedev.pl',
      ),
    ).toEqual(['needs_changes', 'red']);
  });

  it('paints a TTY watch instead of appending status lines', async () => {
    let calls = 0;
    const api = createApi({
      origin: 'https://www.gamedev.pl',
      store: memoryStore({ accessToken: 'gdpl_pat_x', tokenType: 'Bearer', scope: 'creator' }),
      fetch: async () => {
        calls += 1;
        return new Response(JSON.stringify({ status: calls === 1 ? 'building' : 'published' }), { status: 200 });
      },
    });
    const chunks: string[] = [];
    const stdout = { write: (s: string) => (chunks.push(s), true), isTTY: true } as unknown as NodeJS.WriteStream;
    expect(
      await runStatusVerb({
        api,
        token: 'tok',
        maxPolls: 5,
        asJson: false,
        live: true,
        stdout,
        sleep: async () => undefined,
      }),
    ).toBe(EXIT_GREEN);
    expect(calls).toBe(2);
    expect(chunks.join('')).toContain('\x1b[');
    expect(chunks.join('')).toContain('published');
  });

  it('announces a finished Studio round even on the first poll', () => {
    expect(
      shouldAnnounceStatus({ status: 'needs_changes', previewGate: { green: true } }, '', 'needs_changes|||1'),
    ).toBe(true);
    expect(shouldAnnounceStatus({ status: 'building' }, '', 'building')).toBe(false);
    expect(shouldAnnounceStatus({ status: 'building', stall: 'quiet' }, 'building', 'building|quiet')).toBe(true);
    expect(formatStatusEvent({ status: 'needs_changes', previewGate: { green: true } })).toBe(
      'round finished — Studio is waiting (preview green)',
    );
  });

  it('returns EXIT_RED when the publish gate is red', async () => {
    const api = createApi({
      origin: 'https://www.gamedev.pl',
      store: memoryStore({ accessToken: 'gdpl_pat_x', tokenType: 'Bearer', scope: 'creator' }),
      fetch: async () =>
        new Response(JSON.stringify({ status: 'needs_changes', failure: { reason: 'gate_red' } }), { status: 200 }),
    });
    expect(
      await runStatusVerb({
        api,
        token: 'tok',
        maxPolls: 1,
        asJson: false,
        live: false,
        stdout: { write: () => true } as unknown as NodeJS.WriteStream,
      }),
    ).toBe(EXIT_RED);
  });

  it('returns EXIT_RED when the preview gate is red', async () => {
    const api = createApi({
      origin: 'https://www.gamedev.pl',
      store: memoryStore({ accessToken: 'gdpl_pat_x', tokenType: 'Bearer', scope: 'creator' }),
      fetch: async () =>
        new Response(JSON.stringify({ status: 'needs_changes', previewGate: { green: false } }), { status: 200 }),
    });
    expect(
      await runStatusVerb({
        api,
        token: 'tok',
        maxPolls: 1,
        asJson: false,
        live: false,
        stdout: { write: () => true } as unknown as NodeJS.WriteStream,
      }),
    ).toBe(EXIT_RED);
  });
});
