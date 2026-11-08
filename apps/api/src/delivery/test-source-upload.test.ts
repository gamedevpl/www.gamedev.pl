import { describe, expect, it } from 'vitest';
import { checkSeedBundles } from '../creation/seed-bundle.js';
import { assertDeliverableSourcePath, validateSourceUpload } from './games-store.js';

describe('test source delivery', () => {
  it.each(['game/audit.test.ts', 'game/audit.spec.ts', 'tests/audit.test.ts'])(
    'accepts %s for staging and full uploads without executing it',
    async (path) => {
      const testSource = {
        path,
        content: `import test from 'node:test';
import assert from 'node:assert/strict';
import { score } from '${path.startsWith('tests/') ? '../game/model.ts' : './model.ts'}';
test('score', () => assert.equal(score, 7));
throw new Error('must never execute during upload');
`,
      };
      const files = [
        { path: 'SPEC.md', content: '# Audit\n' },
        { path: 'game.ts', content: "export { score } from './game/model.ts';\n" },
        { path: 'game/model.ts', content: 'export const score = 7;\n' },
        {
          path: 'GAME.json',
          content: JSON.stringify({
            engine: { modules: [] },
            howToPlay: { goal: { en: 'Win', pl: 'Wygraj' }, hint: { en: 'Go', pl: 'Idź' } },
          }),
        },
        testSource,
      ];
      expect(assertDeliverableSourcePath(path)).toBe(path);
      expect(validateSourceUpload(files, 'preview')).toContainEqual(testSource);
      expect(await checkSeedBundles('audit-test-game', files)).toEqual({ ok: true });
      expect(
        validateSourceUpload([
          ...files,
          { path: 'TRACE.json', content: '{"samples":[]}' },
          { path: 'PLAYTEST.json', content: '{"expectProgress":["round-start"]}' },
        ]),
      ).toContainEqual(testSource);
    },
  );
});
