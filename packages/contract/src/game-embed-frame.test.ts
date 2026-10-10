import { describe, expect, it } from 'vitest';
import { embedGameHtml } from './game-embed.js';

describe('embedGameHtml frame', () => {
  it('drops the shell gradient and theme frame so phones see no rounded inset', () => {
    const out = embedGameHtml('<html><head></head><body><canvas id="game"></canvas></body></html>');

    expect(out).toContain('html,body{width:100%;height:100%;margin:0;background:#000!important}');
    expect(out).toContain('box-shadow:none!important;border:none!important;border-radius:0!important}');
  });
});
