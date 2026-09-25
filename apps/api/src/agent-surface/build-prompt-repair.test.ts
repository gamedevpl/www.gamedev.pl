import { describe, expect, it } from 'vitest';
import { buildPrompt } from './build-prompt.js';

describe('gate repair prompt', () => {
  it('directs the agent to repair the delivered version using the failed gate report', () => {
    const prompt = buildPrompt({
      jobId: 7,
      slug: 'test-game',
      spec: '',
      channelToken: 'key',
      apiBaseUrl: 'https://www.gamedev.pl',
      undelivered: true,
      gateRepair: { version: 'v2', report: 'smoke: start() threw: missing snapshot()' },
    });
    expect(prompt).toContain('rejected version v2');
    expect(prompt).toContain('Fetch the delivered sources');
    expect(prompt).toContain('smoke: start() threw: missing snapshot()');
    expect(prompt).not.toContain('Nothing from that session is recoverable');
  });
});
