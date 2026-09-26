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

  it('rejects a split builder with a complete manifest but missing steps', () => {
    const result = defineGamePreflight(
      game('const builder = GameKit.defineGame(); builder.start();', ['input', 'gfx', 'effects', 'audio']),
    );
    for (const step of ['input', 'audio', 'init', 'update', 'render', 'snapshot']) {
      expect(result).toContain(`.${step}(...)`);
    }
  });

  it('accepts steps configured through an alias and separate statements', () => {
    expect(
      defineGamePreflight(
        game(
          `
      let builder;
      builder = GameKit.defineGame();
      const alias = builder;
      alias.input({}).audio({});
      builder = builder.init(() => ({})).update(() => {});
      alias.render(() => {}).snapshot(() => ({}));
      builder.start();
    `,
          ['input', 'gfx', 'effects', 'audio'],
        ),
      ),
    ).toBeNull();
  });

  it('does not share steps between shadowed builders or a replacement builder', () => {
    const result = defineGamePreflight(
      game(
        `
      let builder = GameKit.defineGame().input({}).audio({}).init(() => ({})).update(() => {}).render(() => {}).snapshot(() => ({}));
      { const builder = GameKit.defineGame(); builder.start(); }
      builder = GameKit.defineGame();
      builder.start();
    `,
        ['input', 'gfx', 'effects', 'audio'],
      ),
    );
    expect(result?.match(/missing/g)).toHaveLength(2);
  });

  it('does not configure an outer builder by merely declaring a callback', () => {
    const result = defineGamePreflight(
      game(
        `
      const builder = GameKit.defineGame();
      const configure = () => builder.input({}).audio({}).init(() => ({})).update(() => {}).render(() => {}).snapshot(() => ({}));
      builder.start();
    `,
        ['input', 'gfx', 'effects', 'audio'],
      ),
    );
    expect(result).toContain('.input(...)');
  });

  it('ignores comments and games that do not use defineGame', () => {
    expect(defineGamePreflight(game('// GameKit.defineGame()\nexport const score = 1;', ['gfx']))).toBeNull();
  });
});
