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
      /`get_brief`.*one `knowledge_query`.*one `report_progress` saying what you will change, before you open any kit or game file → the unpacked kit/s,
    );
    expect(shell).toContain('That never covers `get_brief`');
    expect(shell).toContain('`knowledge_query` is not a kit-browse tool and this rule does not cover it');
    expect(shell).toContain('are required, every one of them, even when the round is on a clock');
    expect(builderSystemPrompt({ shell: false })).not.toContain('one `knowledge_query`');
  });

  // 2026-11-16: answer named createDirtLand; builder hand-rolled its terrain.
  it('tells the builder to use a GameKit helper the knowledge answer names', () => {
    expect(builderSystemPrompt({ shell: true })).toMatch(
      /When the answer names a GameKit helper.*grep `shared\/game-kit\.d\.ts`.*select its module in `GAME\.json` before writing that mechanism yourself/s,
    );
  });

  // 2026-11-16: unprompted, never consulted; late cost 3x early.
  it('consults the advisor once, before the first edit of a new game, on the shell lane only', () => {
    const shell = builderSystemPrompt({ shell: true });
    expect(shell).toContain(
      'the kickoff numbers one consultation among its opening steps, and it is required like the others',
    );
    expect(shell).toContain(
      'right after your opening `report_progress`, before you open any kit or game file. Ask it for a plan',
    );
    expect(shell).toContain('Do not consult it again in the round, and not at all on a revision or a gate repair');
    expect(builderSystemPrompt({ shell: false })).not.toContain('advisor');
  });

  // 2026-11-16: one report in a six-minute round.
  it('names fixed progress points on the shell lane', () => {
    const shell = builderSystemPrompt({ shell: true });
    expect(shell).toContain('when the game first typechecks, after each capture');
    expect(shell).toContain('and just before `submit_sources`');
    expect(builderSystemPrompt({ shell: false })).toContain('before and after long steps');
  });
});
