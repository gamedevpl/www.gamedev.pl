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
    const content = '<!DOCTYPE html><html><body><div id="app"></div></body></html>';
    const hint = gameManifestHint('index.html', content);
    expect(hint).toMatch(/no element with id="game"/);
    expect(hint).toMatch(/canvas is unavailable/);
  });
});
