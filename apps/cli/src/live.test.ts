import { describe, expect, it } from 'vitest';
import { createLiveScreen, renderLive } from './live.js';
import {
  formatStatusLines,
  formatStatusEvent,
  isPublishTransition,
  isRoundBoundary,
  formatRoundLive,
  proposalLines,
  runStatusVerb,
  shouldAnnounceStatus,
  statusFingerprint,
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

  it('backs off once nothing has visibly changed for a stretch, to bound a wedged or orphaned watch', () => {
    expect(statusWatchDelayMs({ status: 'building' }, 19)).toBe(3000);
    expect(statusWatchDelayMs({ status: 'building' }, 20)).toBe(6000);
    expect(statusWatchDelayMs({ status: 'building' }, 39)).toBe(6000);
    expect(statusWatchDelayMs({ status: 'building' }, 40)).toBe(12_000);
    expect(statusWatchDelayMs({ status: 'building' }, 1000)).toBe(30_000);
    // Idle statuses already use the slow cadence.
    expect(statusWatchDelayMs({ status: 'needs_changes' }, 1000)).toBe(10_000);
  });

  it('never polls under the server floor, but ignores a floor that makes no sense', () => {
    expect(statusWatchDelayMs({ status: 'building', pollAfterMs: 10_000 })).toBe(10_000);
    // A floor under the client cadence changes nothing.
    expect(statusWatchDelayMs({ status: 'building', pollAfterMs: 2000 })).toBe(3000);
    expect(statusWatchDelayMs({ status: 'building', pollAfterMs: 10_000 }, 1000)).toBe(30_000);
    expect(statusWatchDelayMs({ status: 'building', pollAfterMs: 86_400_000 })).toBe(300_000);
    expect(statusWatchDelayMs({ status: 'building', pollAfterMs: -1 })).toBe(3000);
    expect(statusWatchDelayMs({ status: 'building', pollAfterMs: Number.NaN })).toBe(3000);
  });

  it('backs a long `status --watch` off on an unchanged job and honours pollAfterMs', async () => {
    const api = createApi({
      origin: 'https://www.gamedev.pl',
      store: memoryStore({ accessToken: 'gdpl_pat_x', tokenType: 'Bearer', scope: 'creator' }),
      fetch: async () => new Response(JSON.stringify({ status: 'building', pollAfterMs: 10_000 }), { status: 200 }),
    });
    const waits: number[] = [];
    const stdout = { write: () => true } as unknown as NodeJS.WriteStream;
    await runStatusVerb({
      api,
      token: 'tok',
      maxPolls: 90,
      asJson: true,
      live: false,
      stdout,
      sleep: async (ms) => void waits.push(ms),
    });
    expect(waits).toHaveLength(89);
    // The server floor holds from the first wait.
    expect(Math.min(...waits)).toBe(10_000);
    // An idle job settles at the cap.
    expect(waits.at(-1)).toBe(30_000);
  });

  it('resets the backoff when the job visibly moves', async () => {
    let calls = 0;
    const api = createApi({
      origin: 'https://www.gamedev.pl',
      store: memoryStore({ accessToken: 'gdpl_pat_x', tokenType: 'Bearer', scope: 'creator' }),
      fetch: async () => {
        calls += 1;
        const index = calls <= 40 ? 1 : 2;
        return new Response(JSON.stringify({ status: 'building', gateProgress: { stage: 'smoke', index, total: 4 } }), {
          status: 200,
        });
      },
    });
    const waits: number[] = [];
    const stdout = { write: () => true } as unknown as NodeJS.WriteStream;
    await runStatusVerb({
      api,
      token: 'tok',
      maxPolls: 42,
      asJson: true,
      live: false,
      stdout,
      sleep: async (ms) => void waits.push(ms),
    });
    expect(waits[38]).toBeGreaterThan(3000);
    expect(waits.at(-1)).toBe(3000);
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
    expect(shouldAnnounceStatus({ status: 'building', stall: 'quiet' }, 'building', 'building|quiet')).toBe(false);
    expect(formatStatusEvent({ status: 'needs_changes', previewGate: { green: true } })).toBe(
      'round finished — Studio is waiting (preview green)',
    );
  });

  const carded = {
    status: 'needs_changes',
    slug: 'squad-game',
    previewGate: { green: true },
    progress: {
      headSha: 'v7',
      revisions: [
        { text: 'earlier note' },
        {
          proposal: {
            sourceRef: 'shot-source',
            version: 'v7',
            options: [
              {
                id: 'a',
                label: { en: 'Night patrol', pl: 'Nocny patrol' },
                prompt: { en: 'p', pl: 'p' },
                frameRef: 'a',
              },
              {
                id: 'b',
                label: { en: 'Crowded stands', pl: 'Pełne trybuny' },
                prompt: { en: 'p', pl: 'p' },
                frameRef: 'b',
              },
            ],
          },
        },
      ],
    },
  };

  it('names the concept directions and sends the pick to Studio', () => {
    expect(formatStatusEvent(carded)).toBe(
      'round finished — Studio has concept directions: "Night patrol" / "Crowded stands"',
    );
    expect(proposalLines(carded, 'https://x')).toEqual([
      'concept directions waiting: "Night patrol" / "Crowded stands"',
      'pick one in Studio: https://x/studio/squad-game',
    ]);
    expect(formatRoundLive(carded, 'https://x')).toContain('pick one in Studio: https://x/studio/squad-game');
    expect(formatStatusLines(carded, 'https://x')).toContain(
      'concept directions waiting: "Night patrol" / "Crowded stands"',
    );
  });

  it('names a card that lands while the job still reads as building', () => {
    // A green native preview leaves the job submitted, which shows as building.
    const midBuild = { ...carded, status: 'building', previewGate: undefined };
    expect(isRoundBoundary(midBuild)).toBe(true);
    expect(formatStatusEvent(midBuild)).toBe('Studio has concept directions: "Night patrol" / "Crowded stands"');
    expect(shouldAnnounceStatus(midBuild, 'building', statusFingerprint(midBuild))).toBe(true);
  });

  it('treats an agent-relayed request as answering the card', () => {
    const relayed = {
      ...carded,
      progress: {
        ...carded.progress,
        revisions: [...carded.progress.revisions, { text: 'make it night', origin: 'agent' }],
      },
    };
    expect(proposalLines(relayed, 'https://x')).toEqual([]);
  });

  it('drops a card whose delivery a retry replaced', () => {
    const retried = { ...carded, progress: { ...carded.progress, headSha: 'v8' } };
    expect(proposalLines(retried, 'https://x')).toEqual([]);
  });

  it('says nothing when the status names no delivery to match against', () => {
    const { headSha: _headSha, ...withoutHead } = carded.progress;
    expect(proposalLines({ ...carded, progress: withoutHead }, 'https://x')).toEqual([]);
  });

  it('stops naming a card the creator already answered', () => {
    const answered = {
      ...carded,
      progress: { ...carded.progress, revisions: [...carded.progress.revisions, { text: 'make it night' }] },
    };
    expect(proposalLines(answered, 'https://x')).toEqual([]);
    expect(formatStatusEvent(answered)).toBe('round finished — Studio is waiting (preview green)');
  });

  it('keeps naming a card when only the platform spoke after it', () => {
    const acked = {
      ...carded,
      progress: {
        ...carded.progress,
        revisions: [...carded.progress.revisions, { text: 'on it', origin: 'studio' }],
      },
    };
    expect(proposalLines(acked, 'https://x')).not.toEqual([]);
  });

  it('announces a card that lands after the round was already a boundary', () => {
    const before = { status: 'needs_changes', slug: 'squad-game', previewGate: { green: true } };
    const key = statusFingerprint(before);
    expect(statusFingerprint(carded)).not.toBe(key);
    expect(shouldAnnounceStatus(carded, key, statusFingerprint(carded))).toBe(true);
  });

  it('strips terminal escapes out of an agent-written label', () => {
    const hostile = {
      ...carded,
      progress: {
        ...carded.progress,
        revisions: [
          {
            proposal: {
              ...carded.progress.revisions[1].proposal,
              options: [
                { id: 'a', label: { en: '\u001b[31mred', pl: 'x' }, prompt: { en: 'p', pl: 'p' }, frameRef: 'a' },
              ],
            },
          },
        ],
      },
    };
    // A hidden card would pass as stripped; assert it is named.
    expect(formatStatusEvent(hostile)).toContain('red');
    expect(formatStatusEvent(hostile)).not.toContain('\u001b');
  });

  it('says nothing about concepts when no card was drawn', () => {
    expect(proposalLines({ status: 'needs_changes', slug: 'squad-game' }, 'https://x')).toEqual([]);
    expect(formatStatusEvent({ status: 'needs_changes', previewGate: { green: true } })).toBe(
      'round finished — Studio is waiting (preview green)',
    );
  });

  it('keeps gate_red as an open round and skips gate-progress announcements', () => {
    expect(shouldAnnounceStatus({ status: 'needs_changes', failure: { reason: 'gate_red' } }, '', 'k')).toBe(false);
    expect(formatStatusEvent({ status: 'needs_changes', failure: { reason: 'gate_red' } })).toBe(
      'needs_changes (gate_red)',
    );
    expect(formatStatusEvent({ status: 'needs_changes', previewGate: { green: false } })).toBe(
      'needs_changes (preview red)',
    );
    expect(
      shouldAnnounceStatus(
        { status: 'building', gateProgress: { stage: 'smoke', index: 2, total: 4 } },
        'building',
        'building|smoke:2/4',
      ),
    ).toBe(false);
  });

  it('does not repeat a sanitized failure reason on the live strip', () => {
    const esc = String.fromCharCode(27);
    expect(
      formatRoundLive(
        { status: 'needs_changes', failure: { reason: `${esc}[31mgate_red${esc}[0m` } },
        'https://www.gamedev.pl',
      ),
    ).toEqual(['needs_changes (gate_red)']);
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

describe('publish transitions', () => {
  // Opening a live game must not add to the publish count.
  it('counts a publish the session watched, never a game that was already live', () => {
    expect(isPublishTransition('building', 'published')).toBe(true);
    expect(isPublishTransition('needs_changes', 'published')).toBe(true);
    expect(isPublishTransition('', 'published')).toBe(false);
    expect(isPublishTransition('published', 'published')).toBe(false);
    expect(isPublishTransition('building', 'needs_changes')).toBe(false);
  });
});

describe('status --watch telemetry', () => {
  function watcher(statuses: string[], recorded: string[]) {
    let calls = 0;
    const api = createApi({
      origin: 'https://www.gamedev.pl',
      store: memoryStore({ accessToken: 'gdpl_pat_x', tokenType: 'Bearer', scope: 'creator' }),
      fetch: async () => {
        const status = statuses[Math.min(calls, statuses.length - 1)];
        calls += 1;
        return new Response(JSON.stringify({ status }), { status: 200 });
      },
    });
    const stdout = { write: () => true } as unknown as NodeJS.WriteStream;
    return runStatusVerb({
      api,
      token: 'tok',
      maxPolls: 5,
      asJson: false,
      live: false,
      stdout,
      telemetry: { record: (step: string) => recorded.push(step), flush: async () => undefined },
      sleep: async () => undefined,
    });
  }

  it('records a publish the watcher saw happen', async () => {
    const recorded: string[] = [];
    await watcher(['building', 'published'], recorded);
    expect(recorded).toEqual(['published']);
  });

  // Checking an already-live game is not this session finishing one.
  it('records nothing when the first poll is already published', async () => {
    const recorded: string[] = [];
    await watcher(['published'], recorded);
    expect(recorded).toEqual([]);
  });
});
