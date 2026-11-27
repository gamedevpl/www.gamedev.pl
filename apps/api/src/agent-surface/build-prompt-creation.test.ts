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

describe('buildPrompt for a shell creation round', () => {
  // 2026-11-27: builders end after one submit.
  it('asks for the visual check before the first submit', () => {
    const create = { ...BRIEF, slug: undefined, createGame: { title: 'Star Parcel Run', concept: 'Guide a ship.' } };
    const rough = 'even if you can see things you would rather improve';
    const shell = buildPrompt(create, { shell: true });
    expect(shell).toContain('before the first submit, do the one visual check');
    expect(shell).not.toContain(rough);
    expect(shell).toContain('`end` straight after the submit returns');
    expect(buildPrompt(create)).toContain(rough);
    expect(buildPrompt(BRIEF, { shell: true })).toContain(rough);
  });
});
