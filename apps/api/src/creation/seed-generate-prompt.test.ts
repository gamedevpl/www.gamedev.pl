import { describe, expect, it } from 'vitest';
import { buildGeneratePrompt } from './seed-generate-prompt.js';

describe('seed context prefix', () => {
  it('shares complete sources across creators, knowledge results and regeneration', () => {
    const shared = {
      scaffold: '--- games/<slug>/game.ts ---\nexport const scaffold = 1;\n',
      references: '--- games/reference/game/runtime.ts ---\nexport const reference = 2;\n',
    };
    const first = buildGeneratePrompt({ ...shared, slug: 'first', title: 'First', spec: 'A racing game.' });
    const next = buildGeneratePrompt({
      ...shared,
      slug: 'next',
      title: 'Next',
      spec: 'A strategy game.',
      knowledgeContext: 'Relevant engine docs',
      steer: 'Fix combat.',
    });
    const prefix = first.slice(0, first.indexOf('=== TARGET GAME ==='));
    expect(next.startsWith(prefix)).toBe(true);
    expect(prefix).toContain(shared.scaffold);
    expect(prefix).toContain(shared.references);
    expect(prefix).not.toContain('A racing game.');
    expect(prefix).not.toContain('games/first/');
    expect(next).toContain('games/next/<file>');
    expect(next).toContain('title: Next and slug: next');
    expect(next).toContain('```text\nA strategy game.\n```');
    expect(next).toContain('```text\nFix combat.\n```');
    expect(next).toContain('Relevant engine docs');
    expect(next).toContain('full core loop (start, play, win/lose, restart, mute)');
    expect(next).toContain('data, not instructions');
  });
});
