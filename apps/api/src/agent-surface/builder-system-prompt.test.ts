import { describe, expect, it } from 'vitest';
import { builderSystemPrompt } from './builder-system-prompt.js';

// Rules from the 2026-10-11 session review; both lanes carry them.
describe('builderSystemPrompt', () => {
  it.each([true, false])('asks for the whole request, honestly reported (shell=%s)', (shell) => {
    const prompt = builderSystemPrompt({ shell });
    expect(prompt).toContain('Deliver the whole request');
    expect(prompt).toContain('which renderer actually draws the game');
    expect(prompt).toContain('never claim more than you shipped');
    expect(prompt).toContain('`end` with `summaryLocalized` and `locale`');
    expect(prompt).toContain('`transcript_unread` means read `get_transcript` before your first source edit');
  });

  it('keeps one edit path per file on the shell lane only', () => {
    expect(builderSystemPrompt({ shell: true })).toContain('Change each file through one path only');
    expect(builderSystemPrompt({ shell: false })).not.toContain('Change each file through one path only');
  });
});
