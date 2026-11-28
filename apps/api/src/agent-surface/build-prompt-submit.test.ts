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

// 2026-11-27: "rather improve" beat the art pass in every round.
describe('buildPrompt submit lines', () => {
  it('sends a shell creation round through one look check before its only preview', () => {
    const create = {
      ...BRIEF,
      slug: undefined,
      createGame: { title: 'Star Parcel Run', concept: 'Guide a courier ship across a bright sky.' },
    };
    const shellCreate = buildPrompt(create, { shell: true });
    expect(shellCreate).toContain('once the game is playable and its one look check (system prompt) is done');
    expect(shellCreate).toContain('Stage the `CAPTURE.json` you ran locally with the first preview');
    expect(shellCreate).toContain('`greaterThanOrEqual`');
    expect(shellCreate).not.toContain('even if you can see things you would rather improve');
    expect(shellCreate).not.toContain('`end` straight after the submit returns');
    expect(buildPrompt(create)).toContain('`end` straight after the submit returns');
    expect(buildPrompt(BRIEF, { shell: true })).toContain('`end` straight after the submit returns');
  });
});
