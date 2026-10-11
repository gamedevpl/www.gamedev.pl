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
  it.each([true, false])('asks to open attached images before editing (shell=%s)', (shell) => {
    const prompt = buildPrompt({ ...BRIEF, feedback: 'Add ice floes.' }, { shell });
    expect(prompt).toContain('download and look at each before your first edit');
    expect(prompt).toContain('`referenceImages` from `read_inbox`');
    expect(prompt).not.toContain('Skip optional polish');
  });
});
