import { expect, it } from 'vitest';
import { checkSeedBundles } from './seed-bundle.js';

it('checks hot boot modules together with the declared behavior graph', async () => {
  const hot = { protocol: 1, id: 'pilot', stateVersion: 1, observationVersion: 1, behavior: 'game/behavior.ts' };
  const files = [
    { path: 'GAME.json', content: JSON.stringify({ hot }) },
    { path: 'game.ts', content: 'export default builder=>builder.input({}).audio().init(()=>({}));' },
    { path: 'game/behavior.ts', content: 'export default {update(){},render(){},snapshot(){return {}}};' },
  ];
  expect(await checkSeedBundles('pilot', files)).toEqual({ ok: true });
  expect((await checkSeedBundles('pilot', files.slice(0, 2))).ok).toBe(false);
});
