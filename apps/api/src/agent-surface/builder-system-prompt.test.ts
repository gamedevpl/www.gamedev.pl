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
    expect(prompt).toContain('Images attached to creator messages');
  });

  it('keeps one edit path per file on the shell lane only', () => {
    expect(builderSystemPrompt({ shell: true })).toContain('Change each file through one path only');
    expect(builderSystemPrompt({ shell: true })).toContain('Do not patch over MCP separately');
    expect(builderSystemPrompt({ shell: false })).not.toContain('Change each file through one path only');
    expect(builderSystemPrompt({ shell: false })).toContain('Prefer patching single files');
    expect(builderSystemPrompt({ shell: true })).not.toContain('Prefer patching single files');
    expect(builderSystemPrompt({ shell: true })).toContain('look at each before your first source edit');
    expect(builderSystemPrompt({ shell: false })).toContain('you cannot open their URLs here');
  });

  // Kit typecheck needs node_modules and the game in games/<slug>/.
  it('sets the unpacked kit up as a typecheck workspace on the shell lane only', () => {
    const shell = builderSystemPrompt({ shell: true });
    expect(shell).toContain('run `npm ci --ignore-scripts` in it once');
    expect(shell).toContain('`gamedevpl-creator-kit/games/<slug>/`');
    expect(shell).toContain('run `npm run typecheck -- <slug>` from the kit root');
    expect(shell).not.toContain('no browser, npm ci');
    expect(builderSystemPrompt({ shell: false })).not.toContain('npm ci');
  });
});
