import { describe, expect, it } from 'vitest';
import { createApi } from './api.js';
import { memoryStore } from './keychain.js';
import { EXIT_REFUSED } from './exit-codes.js';
import { handleReplLine } from './repl.js';
import { runStatusVerb } from './status-watch.js';
import { createRoundWatch } from './tui/round-watch.js';
import { getStatus } from './turn.js';

const invalidStatus = {
  phase: 'ready',
  slug: 'example-game',
  preview: { slug: 'example-game' },
  previewGate: { green: true },
};

function apiFor(body: unknown) {
  return createApi({
    origin: 'https://www.gamedev.pl',
    store: memoryStore({ accessToken: 'test-token', tokenType: 'Bearer', scope: 'creator' }),
    env: {},
    fetch: async () => new Response(JSON.stringify(body), { status: 200 }),
  });
}

describe('round status response validation', () => {
  it.each([invalidStatus, {}, null, { status: '' }, { status: 42 }, { status: 'ready' }])(
    'refuses a malformed status without inventing a lifecycle state: %j',
    async (body) => {
      await expect(getStatus(apiFor(body), 'round')).rejects.toMatchObject({
        exitCode: EXIT_REFUSED,
        message: expect.stringContaining('invalid round status'),
      });
    },
  );

  it('preserves valid response fields for JSON output and live formatting', async () => {
    const body = { ...invalidStatus, status: 'in_review', phase: 'ready_for_review', pollAfterMs: 10_000 };
    expect(await getStatus(apiFor(body), 'round')).toEqual(body);
  });

  it('prints an actionable error from /status', async () => {
    const lines: string[] = [];
    await handleReplLine({
      line: '/status',
      api: apiFor(invalidStatus),
      token: 'round',
      write: (line) => lines.push(line),
    });
    expect(lines.join('\n')).toContain('invalid round status');
    expect(lines.join('\n')).not.toContain('undefined');
  });

  it('refuses an invalid one-shot status before printing it', async () => {
    const lines: string[] = [];
    await expect(
      runStatusVerb({
        api: apiFor(invalidStatus),
        token: 'round',
        maxPolls: 1,
        asJson: false,
        live: false,
        stdout: { write: (line: string) => (lines.push(line), true) } as NodeJS.WriteStream,
      }),
    ).rejects.toMatchObject({ exitCode: EXIT_REFUSED });
    expect(lines).toEqual([]);
  });

  it('shows the same error in the live Studio block without announcing a round outcome', async () => {
    const lines: string[][] = [];
    const announced: string[] = [];
    const watch = createRoundWatch({
      api: apiFor(invalidStatus),
      getToken: () => 'round',
      setLive: (live) => lines.push(live),
      announce: (line) => announced.push(line),
      sleep: async () => watch.stop(),
    });
    await watch.run;
    expect(lines.flat().join('\n')).toContain('invalid round status');
    expect(lines.flat().join('\n')).not.toContain('undefined');
    expect(announced).toEqual([]);
  });
});
