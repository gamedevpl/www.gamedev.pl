import { describe, expect, it } from 'vitest';
import { isAllowedSeedPath, normalizeSeedPath } from './seed-paths.js';

describe('seed path containment', () => {
  it('strips the games/<slug>/ prefix a model actually emits', () => {
    expect(normalizeSeedPath('games/my-game/SPEC.md', 'my-game')).toBe('SPEC.md');
    expect(normalizeSeedPath('./game/model.ts', 'my-game')).toBe('game/model.ts');
  });

  it('refuses everything outside the one game directory', () => {
    for (const allowed of [
      'SPEC.md',
      'GAME.json',
      'game.ts',
      'index.html',
      'style.css',
      'ACCEPTANCE.json',
      'EDITOR.json',
      'EDITOR.ts',
      'EDITOR.content.json',
      'game/model.ts',
      'game/ai/steering.ts',
    ]) {
      expect(isAllowedSeedPath(allowed), allowed).toBe(true);
    }

    for (const refused of [
      'games/other-game/game.ts',
      'shared/modules/gfx.ts',
      'tools/validate.ts',
      '.github/workflows/validate.yml',
      '../evil.ts',
      'game/../../evil.ts',
      '/etc/passwd',
      'TRACE.json',
      'CAPTURE.json',
      'media/opening.png',
      'game/notes.md',
    ]) {
      expect(isAllowedSeedPath(normalizeSeedPath(refused, 'my-game')), refused).toBe(false);
    }
  });
  it('does not let another game be reached by prefixing it with this slug', () => {
    expect(isAllowedSeedPath(normalizeSeedPath('games/my-game/../other/game.ts', 'my-game'))).toBe(false);
  });
});
