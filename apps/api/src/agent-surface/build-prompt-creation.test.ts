import { describe, expect, it } from 'vitest';
import type { BuildBrief } from './agent-backend.js';
import { buildPrompt } from './build-prompt.js';

const BRIEF: BuildBrief = {
  jobId: 42,
  slug: 'comet-courier',
  spec: 'A game where you deliver parcels between comets.',
  channelToken: 'tok_abc',
  apiBaseUrl: 'https://www.gamedev.pl',
};

describe('buildPrompt for a new game on the shell lane', () => {
  const check = 'before the first submit, do the one visual check';
  const rough = 'even if you can see things you would rather improve';

  // 2026-11-27: builders end after one submit.
  it('asks for the visual check before the first submit, Studio slug or create_game', () => {
    const create = { ...BRIEF, slug: undefined, createGame: { title: 'Star Parcel Run', concept: 'Guide a ship.' } };
    for (const brief of [BRIEF, create]) {
      const shell = buildPrompt(brief, { shell: true });
      expect(shell).toContain(check);
      expect(shell).toContain('two captures and one fix, no more');
      expect(shell).not.toContain(rough);
      expect(shell).toContain('`end` straight after the submit returns');
    }
  });

  it('keeps the plain submit line for feedback, gate repair, a retry and the MCP lane', () => {
    const later = [
      { ...BRIEF, feedback: 'Make the comets bigger.' },
      { ...BRIEF, gateRepair: { version: 'v1', report: 'typecheck failed' } },
      { ...BRIEF, undelivered: true, previewVersion: 'v1' },
    ];
    for (const brief of later) expect(buildPrompt(brief, { shell: true })).toContain(rough);
    expect(buildPrompt(BRIEF)).toContain(rough);
    expect(buildPrompt(BRIEF)).not.toContain(check);
  });
});
