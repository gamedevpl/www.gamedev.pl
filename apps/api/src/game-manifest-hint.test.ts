import { describe, expect, it } from 'vitest';
import { gameManifestHint } from './game-manifest-hint.js';

describe('gameManifestHint', () => {
  it('ignores every path other than GAME.json', () => {
    expect(gameManifestHint('game.ts', '{}')).toBeNull();
    expect(gameManifestHint('game/model.ts', '{}')).toBeNull();
  });

  it('flags invalid JSON', () => {
    expect(gameManifestHint('GAME.json', '{ not json')).toMatch(/not valid JSON/);
  });

  it('flags a non-object manifest', () => {
    expect(gameManifestHint('GAME.json', '[]')).toMatch(/must be a JSON object/);
    expect(gameManifestHint('GAME.json', '"hi"')).toMatch(/must be a JSON object/);
  });

  it('flags a manifest with no engine block at all', () => {
    const content = JSON.stringify({
      title: 'Arena Brawlers',
      slug: 'arena-brawlers',
      description: '3v3 top-down arena skirmish.',
      orientation: 'any',
    });
    const hint = gameManifestHint('GAME.json', content);
    expect(hint).toMatch(/engine\.modules/);
    expect(hint).toMatch(/modules'/);
  });

  it('flags engine.modules that is missing, empty, or not an array', () => {
    expect(gameManifestHint('GAME.json', JSON.stringify({ engine: {} }))).toMatch(/engine\.modules/);
    expect(gameManifestHint('GAME.json', JSON.stringify({ engine: { modules: [] } }))).toMatch(/engine\.modules/);
    expect(gameManifestHint('GAME.json', JSON.stringify({ engine: { modules: 'gfx' } }))).toMatch(/engine\.modules/);
  });

  it('flags non-string entries in engine.modules', () => {
    expect(gameManifestHint('GAME.json', JSON.stringify({ engine: { modules: ['gfx', 3] } }))).toMatch(
      /must contain only strings/,
    );
  });

  it('flags an engine module name the kit does not recognize', () => {
    const content = JSON.stringify({ engine: { modules: ['gfx', 'not-a-real-module'] } });
    expect(gameManifestHint('GAME.json', content)).toMatch(/not-a-real-module.*not a GameKit module/);
  });

  it('flags a duplicate engine module', () => {
    const content = JSON.stringify({ engine: { modules: ['gfx', 'gfx'] } });
    expect(gameManifestHint('GAME.json', content)).toMatch(/duplicate entry/);
  });

  it('flags engine.modules out of canonical order (arena-brawlers, 2026-08-09)', () => {
    const content = JSON.stringify({ engine: { modules: ['party', 'input', 'drawing', 'effects', 'gfx', 'audio'] } });
    const hint = gameManifestHint('GAME.json', content);
    expect(hint).toMatch(/out of order/);
    expect(hint).toContain('["input","drawing","gfx","effects","audio","party"]');
  });

  it('flags the audio module selected without audio.sounds / audio.music', () => {
    const noAudioBlock = JSON.stringify({ engine: { modules: ['gfx', 'audio'] } });
    expect(gameManifestHint('GAME.json', noAudioBlock)).toMatch(/audio\.sounds/);

    const soundsOnly = JSON.stringify({
      engine: { modules: ['gfx', 'audio'] },
      audio: { sounds: ['coin'] },
    });
    expect(gameManifestHint('GAME.json', soundsOnly)).toMatch(/audio\.music/);
  });

  it('accepts a minimal valid manifest with no audio module', () => {
    const content = JSON.stringify({ engine: { modules: ['input', 'gfx'] } });
    expect(gameManifestHint('GAME.json', content)).toBeNull();
  });

  it('accepts a valid manifest with audio wired up', () => {
    const content = JSON.stringify({
      engine: { modules: ['input', 'gfx', 'audio'] },
      audio: { sounds: ['coin', 'pop'], music: 'dream-float' },
    });
    expect(gameManifestHint('GAME.json', content)).toBeNull();
  });

  it('accepts an empty index.html', () => {
    expect(gameManifestHint('index.html', '')).toBeNull();
    expect(gameManifestHint('index.html', '   \n  ')).toBeNull();
  });

  it('accepts a real body fragment with the canvas the kit expects', () => {
    expect(gameManifestHint('index.html', '<canvas id="game"></canvas>')).toBeNull();
    expect(gameManifestHint('index.html', '<div class="hud"></div><canvas id="game"></canvas>')).toBeNull();
  });

  it('flags a <link href> tag (arena-brawlers, 2026-08-09)', () => {
    const content = '<link rel="stylesheet" href="./style.css" /><canvas id="game"></canvas>';
    expect(gameManifestHint('index.html', content)).toMatch(/already inlined.*style\.css|<link href/i);
  });

  it('flags a <script src> tag (arena-brawlers, 2026-08-09)', () => {
    const content = '<canvas id="game"></canvas><script type="module" src="./game.ts"></script>';
    expect(gameManifestHint('index.html', content)).toMatch(/already inlined.*game\.ts|<script src/i);
  });

  it('flags a non-empty index.html missing the #game canvas', () => {
    const content = '<div class="wrap"><div id="app"></div></div>';
    const hint = gameManifestHint('index.html', content);
    expect(hint).toMatch(/no element with id="game"/);
    expect(hint).toMatch(/canvas is unavailable/);
  });

  it('flags a complete HTML document before any other index.html check (transport-tycoon-remake, 2026-08-18)', () => {
    // Exact shape that leaked stray chrome under the canvas on /play.
    const content =
      '<!doctype html><html><head><meta charset="utf-8"><title>Sunny Transport</title></head><body>' +
      '<canvas id="game" width="960" height="640"></canvas>' +
      '<main><h1>Sunny Transport</h1><p>Build a profitable coal railway.</p></main></body></html>';
    const hint = gameManifestHint('index.html', content);
    expect(hint).toMatch(/complete HTML document/);
    expect(hint).toMatch(/inlines this file into the <body>/);
    expect(hint).toMatch(/#game-title/);
  });

  it('flags a bare <html> or <body> wrapper even without a doctype', () => {
    expect(gameManifestHint('index.html', '<html><body><canvas id="game"></canvas></body></html>')).toMatch(
      /complete HTML document/,
    );
    expect(gameManifestHint('index.html', '<body>\n<canvas id="game"></canvas>\n</body>')).toMatch(
      /complete HTML document/,
    );
  });

  it('does not read <header> as a document <head> wrapper', () => {
    const content = '<header class="hud"></header><canvas id="game"></canvas><h1 id="game-title">T</h1>';
    expect(gameManifestHint('index.html', content)).toBeNull();
  });

  it('flags a title heading the play page cannot hide', () => {
    const content = '<canvas id="game"></canvas><main><h1>Sunny Transport</h1><p>Build a railway.</p></main>';
    const hint = gameManifestHint('index.html', content);
    expect(hint).toMatch(/<h1> without id="game-title"/);
    expect(hint).toMatch(/stays visible as stray text under the canvas/);
  });

  it('accepts the standard chrome the play page hides', () => {
    const content =
      '<div class="wrap"><h1 id="game-title">Sunny Transport</h1><p id="game-desc">Build a railway.</p>' +
      '<canvas id="game"></canvas><p class="hint">Watch the train loop.</p></div>';
    expect(gameManifestHint('index.html', content)).toBeNull();
  });
});
