import { expect, it } from 'vitest';
import { checkSeedBundles } from './seed-bundle.js';

it('bundles a directory index and JSON modules without treating JSON as a directory', async () => {
  const files = [
    {
      path: 'game.ts',
      content: "import { speed } from './enemy'; import data from './data.json'; console.log(speed, data);",
    },
    { path: 'enemy/index.ts', content: 'export const speed = 2;' },
    { path: 'data.json', content: '{"enabled":true}' },
  ];
  expect(await checkSeedBundles('demo', files)).toEqual({ ok: true });
  const missingJson = await checkSeedBundles(
    'demo',
    files.filter((file) => file.path !== 'data.json'),
  );
  expect(missingJson.ok).toBe(false);
  if (!missingJson.ok) expect(missingJson.errors.join(' ')).toContain('data.json');
});
