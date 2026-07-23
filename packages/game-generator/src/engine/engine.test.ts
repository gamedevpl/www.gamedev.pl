import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

describe('Game Engine Runtime Modules', () => {
  const enginePath = path.resolve(__dirname, 'gamedev-engine.js');
  const assetsPath = path.resolve(__dirname, 'gamedev-assets.js');
  const audioPath = path.resolve(__dirname, 'gamedev-audio.js');

  it('gamedev-engine.js file exists and is non-empty', () => {
    expect(fs.existsSync(enginePath)).toBe(true);
    const content = fs.readFileSync(enginePath, 'utf-8');
    expect(content).toContain('Gamedev');
    expect(content).toContain('GameApp');
    expect(content).toContain('InputManager');
    expect(content).toContain('ParticleSystem');
  });

  it('gamedev-assets.js file exists and contains palettes and sprite generators', () => {
    expect(fs.existsSync(assetsPath)).toBe(true);
    const content = fs.readFileSync(assetsPath, 'utf-8');
    expect(content).toContain('GamedevAssets');
    expect(content).toContain('Palettes');
    expect(content).toContain('createSprite');
  });

  it('gamedev-audio.js file exists and contains Web Audio sound synthesizer', () => {
    expect(fs.existsSync(audioPath)).toBe(true);
    const content = fs.readFileSync(audioPath, 'utf-8');
    expect(content).toContain('GamedevAudio');
    expect(content).toContain('SoundSynthesizer');
    expect(content).toContain('coin');
    expect(content).toContain('laser');
  });
});
