import { runInNewContext } from 'node:vm';
import { describe, expect, it } from 'vitest';
import { assemblePublishedGameHtml, CredentialLeakError } from './assemble.js';
import { protectGameScript } from './protect-script.js';

// Shaped like a real bundle: esbuild emits each game as an iife.
const GAME = `
window.__GAME_AUDIO_ASSETS__ = { hit: 'data:audio/wav;base64,UklGRg==' };
window.GameKit = { label: 'secret-level-name-for-the-boss-stage' };
(() => {
  const PLAYER_SPEED_PER_SECOND = 240;
  function advancePlayerPosition(position, elapsedSeconds) {
    return position + PLAYER_SPEED_PER_SECOND * elapsedSeconds;
  }
  window.result = advancePlayerPosition(10, 0.5);
})();
`;
const MAPPED = `${GAME}//# sourceMappingURL=data:application/json;base64,e30=\n`;

function run(js: string): Record<string, unknown> {
  const window: Record<string, unknown> = {};
  runInNewContext(js, { window });
  return window;
}

describe('protectGameScript', () => {
  it('behaves like the original', async () => {
    const protectedJs = await protectGameScript(GAME);

    expect(run(protectedJs).result).toBe(run(GAME).result);
  });

  it('drops local names, comments and any source map reference', async () => {
    const protectedJs = await protectGameScript(MAPPED);

    expect(protectedJs).not.toContain('advancePlayerPosition');
    expect(protectedJs).not.toContain('PLAYER_SPEED_PER_SECOND');
    expect(protectedJs).not.toContain('sourceMappingURL');
    expect(protectedJs).not.toContain('secret-level-name-for-the-boss-stage');
  });

  it('keeps window globals and data: URIs intact', async () => {
    const window = run(await protectGameScript(GAME));

    expect(window.__GAME_AUDIO_ASSETS__).toEqual({ hit: 'data:audio/wav;base64,UklGRg==' });
    expect(window.GameKit).toEqual({ label: 'secret-level-name-for-the-boss-stage' });
  });

  it('is deterministic for the same input', async () => {
    expect(await protectGameScript(GAME)).toBe(await protectGameScript(GAME));
  });
});

describe('assemblePublishedGameHtml', () => {
  const project = { title: 'Game', description: '', html: '<canvas></canvas>', js: GAME, css: '' };

  it('ships the protected script, not the readable one', async () => {
    const html = await assemblePublishedGameHtml({ ...project, js: MAPPED }, { restrictNetwork: true });

    expect(html).toContain('Content-Security-Policy');
    expect(html).not.toContain('advancePlayerPosition');
    expect(html).not.toContain('sourceMappingURL');
  });

  it('scans the readable sources for credentials', async () => {
    const leaky = { ...project, js: `${GAME}\nconst key = 'ghp_${'a'.repeat(36)}';` };

    await expect(assemblePublishedGameHtml(leaky)).rejects.toBeInstanceOf(CredentialLeakError);
  });
});
