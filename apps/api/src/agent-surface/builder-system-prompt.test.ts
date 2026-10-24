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
    expect(prompt).toContain('Images the creator attached');
  });

  it('keeps one edit path per file on the shell lane only', () => {
    expect(builderSystemPrompt({ shell: true })).toContain('Change each file through one path only');
    expect(builderSystemPrompt({ shell: true })).toContain('Do not change anything over MCP');
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
    expect(shell).toContain('until it prints `typecheck exit 0`');
    expect(shell).toContain('Never tell the creator a typecheck passed unless you saw that line');
    expect(shell).not.toContain('no browser, npm ci');
    expect(builderSystemPrompt({ shell: false })).not.toContain('npm ci');
  });

  it('captures visual requests on the shell lane only, once for 3D', () => {
    const shell = builderSystemPrompt({ shell: true });
    expect(shell).toContain('npm run --silent capture -- <slug> --stills --out /tmp/shots-after');
    expect(shell).toContain('compare two of its PNGs taken seconds apart');
    expect(shell).toContain('SwiftShader and takes one to three minutes, so capture it once, after your edit');
    expect(shell).toContain('If no browser starts, do not try to install one');
    expect(shell).toContain('revise it and capture again before you submit');
    expect(builderSystemPrompt({ shell: false })).not.toContain('npm run --silent capture');
  });

  it('names one delivery path per edit size on the shell lane', () => {
    const shell = builderSystemPrompt({ shell: true });
    expect(shell).toContain('send `patch_source_file` with the same old/new text you applied locally');
    expect(shell).toContain('(up to 50 per call), then PUT them all from one bash loop');
    expect(shell).toContain('Do not change anything over MCP that you did not change and typecheck locally');
  });

  // 2026-10-24: the kit-browse rule was read as covering knowledge_query.
  it('keeps knowledge_query and the first report_progress in the shell round order', () => {
    const shell = builderSystemPrompt({ shell: true });
    expect(shell).toMatch(
      /`get_brief`.*one `knowledge_query`.*one `report_progress` saying what you will change → build/s,
    );
    expect(shell).toContain('`knowledge_query` is not a kit-browse tool and this rule does not cover it');
    expect(shell).toContain('are required, every one of them, even when the round is on a clock');
    expect(builderSystemPrompt({ shell: false })).not.toContain('one `knowledge_query`');
  });
});
