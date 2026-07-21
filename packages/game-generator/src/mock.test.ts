import { describe, expect, it } from 'vitest';
import { MockGameGenerator } from './mock.js';

const generator = new MockGameGenerator();

describe('MockGameGenerator', () => {
  it('returns non-empty html/js/css for a generic prompt', async () => {
    const game = await generator.generate('a fun little game');
    expect(game.html.length).toBeGreaterThan(0);
    expect(game.js.length).toBeGreaterThan(0);
    expect(game.css.length).toBeGreaterThan(0);
    expect(game.js).toContain('requestAnimationFrame');
  });

  it('selects the collect template for collect-style prompts', async () => {
    const game = await generator.generate('collect coins in a basket');
    // The basket emoji is distinctive to the collect template.
    expect(game.js).toContain('🧺');
    expect(game.html).toContain('basket');
  });

  it('selects the space template for space-themed prompts', async () => {
    const game = await generator.generate('rocket ship dodging asteroids');
    // Edge-wrapping is distinctive to the space template.
    expect(game.js).toContain('Wrap around every edge');
    expect(game.html).toContain('wrap around the edges');
  });

  it('selects the dodge template for dodge-style prompts', async () => {
    const game = await generator.generate('dodge falling rocks');
    expect(game.js).toContain('dodge the falling hazards');
    expect(game.html).toContain('falling hazards');
  });

  it('personalizes the title from the prompt and leaves no placeholders', async () => {
    const game = await generator.generate('dodge the falling rocks');
    expect(game.title.toLowerCase()).toContain('dodge');
    expect(game.html).toContain(game.title);
    for (const source of [game.html, game.js]) {
      expect(source).not.toContain('__TITLE__');
      expect(source).not.toContain('__DESCRIPTION__');
    }
  });

  it('falls back to a default title when the prompt is empty', async () => {
    const game = await generator.generate('');
    expect(game.title.length).toBeGreaterThan(0);
    expect(game.html).not.toContain('__TITLE__');
  });

  describe('Polish prompts', () => {
    it('selects the collect template', async () => {
      const game = await generator.generate('Zbieraj monety zanim czas się skończy');
      expect(game.js).toContain('🧺');
    });

    it('selects the space template', async () => {
      const game = await generator.generate('Poleć rakietą przez asteroidy');
      expect(game.js).toContain('Wrap around every edge');
    });

    it('selects the dodge template', async () => {
      const game = await generator.generate('Unikaj spadających skał');
      expect(game.js).toContain('dodge the falling hazards');
    });
  });
});
