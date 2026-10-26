import { expect, it } from 'vitest';
import { gameTypeScriptEntry } from './hot-game-entry.js';

it('keeps ordinary entry points and validates hot bootstrap paths and schemas', () => {
  expect(gameTypeScriptEntry('original', '{}')).toEqual({ source: 'original', entryFile: 'game.ts' });
  const hot = { protocol: 1, id: 'pilot', stateVersion: 1, observationVersion: 1, behavior: 'game/behavior.ts' };
  expect(gameTypeScriptEntry('original', JSON.stringify({ hot }))).toMatchObject({ entryFile: '__hot-bootstrap.ts' });
  for (const value of [
    { ...hot, behavior: '../escape.ts' },
    { ...hot, stateVersion: 0 },
    { ...hot, protocol: 2 },
  ])
    expect(() => gameTypeScriptEntry('original', JSON.stringify({ hot: value }))).toThrow('Invalid');
  const output = gameTypeScriptEntry('', JSON.stringify({ hot: { ...hot, id: '</script>' } }));
  expect(output.source).not.toContain('</script>');
});
