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

// 2026-10-11 review: a round skipped the creator picture as polish.
describe('buildPrompt and creator images', () => {
  it('asks a shell round to open attached images before editing', () => {
    const prompt = buildPrompt({ ...BRIEF, feedback: 'Add ice floes.' }, { shell: true });
    expect(prompt).toContain('curl each and `read` the file before your first edit');
    expect(prompt).toContain('Reads come first');
    expect(prompt).not.toContain('Execute tools immediately');
    expect(prompt).not.toContain('Skip optional polish');
  });

  it('tells a no-shell round to say it could not see the images', () => {
    const prompt = buildPrompt({ ...BRIEF, feedback: 'Add ice floes.' }, { shell: false });
    expect(prompt).toContain('URLs you cannot open here');
    expect(prompt).not.toContain('curl each');
    expect(prompt).not.toContain('Skip optional polish');
  });
});
