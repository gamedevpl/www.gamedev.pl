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

describe('audio fit in the build brief', () => {
  it('sends a shell round to the kit search', () => {
    const prompt = buildPrompt(BRIEF, { shell: true });
    expect(prompt).toContain('npm run audio:find -- <words>');
    expect(prompt).toContain('audio.wanted');
    expect(prompt).toContain('music.json');
  });

  it('sends a round without a shell to the kit browse tools', () => {
    const prompt = buildPrompt(BRIEF);
    expect(prompt).toContain('search_kit_files');
    expect(prompt).not.toContain('audio:find');
  });

  it('leaves feedback and gate-repair rounds alone', () => {
    expect(buildPrompt({ ...BRIEF, feedback: 'make it faster' }, { shell: true })).not.toContain('audio:find');
  });
});
