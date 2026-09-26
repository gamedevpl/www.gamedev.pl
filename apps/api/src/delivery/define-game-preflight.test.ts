import { describe, expect, it } from 'vitest';
import { defineGamePreflight } from './define-game-preflight.js';

const game = (source: string, modules: string[]) => [
  { path: 'game.ts', content: source },
  { path: 'GAME.json', content: JSON.stringify({ engine: { modules } }) },
];

describe('defineGamePreflight', () => {
  it('reports every missing fluent step and engine module before the gate', () => {
    const result = defineGamePreflight(
      game('GameKit.defineGame().init(() => ({})).update(() => {}).render(() => {}).start();', [
        'input',
        'gfx',
        'audio',
      ]),
    );
    expect(result).toContain('.input(...)');
    expect(result).toContain('.audio(...)');
    expect(result).toContain('.snapshot(...)');
    expect(result).toContain('"effects"');
  });

  it('checks engine modules when the builder is split across statements', () => {
    const result = defineGamePreflight(
      game('const builder = GameKit.defineGame(); builder.input({}).audio({}).start();', ['input', 'gfx', 'audio']),
    );
    expect(result).toContain('"effects"');
  });

  it('accepts a complete direct builder', () => {
    expect(
      defineGamePreflight(
        game(
          'GameKit.defineGame().input({}).audio({}).init(() => ({})).update(() => {}).render(() => {}).snapshot(() => ({})).start();',
          ['input', 'gfx', 'effects', 'audio'],
        ),
      ),
    ).toBeNull();
  });

  it('ignores comments and games that do not use defineGame', () => {
    expect(defineGamePreflight(game('// GameKit.defineGame()\nexport const score = 1;', ['gfx']))).toBeNull();
  });
});
