import { describe, expect, it } from 'vitest';
import { validateSourceUpload, type SourceFile } from './games-store.js';

const FILES: SourceFile[] = [
  { path: 'SPEC.md', content: '---\ntitle: Fresh game\n---\n' },
  { path: 'game.ts', content: 'export {};' },
  {
    path: 'GAME.json',
    content: JSON.stringify({
      engine: { modules: [] },
      howToPlay: {
        goal: { en: 'Win', pl: 'Wygraj' },
        hint: { en: 'Move', pl: 'Ruszaj się' },
      },
    }),
  },
  { path: 'TRACE.json', content: '{"samples":[]}' },
  { path: 'PLAYTEST.json', content: '{"expectProgress":["round-start"]}' },
];

describe('new-game editor delivery contract', () => {
  it.each(['preview', 'publish'] as const)('requires an editor declaration for %s delivery', (mode) => {
    expect(() => validateSourceUpload(FILES, mode, false, true)).toThrow(/EDITOR\.json or EDITOR\.ts is required/);
  });

  it('accepts an editor and reports the missing path precisely', () => {
    expect(
      validateSourceUpload([...FILES, { path: 'EDITOR.json', content: '{}' }], 'preview', false, true),
    ).toHaveLength(FILES.length + 1);
    expect(
      validateSourceUpload(
        [...FILES, { path: 'EDITOR.ts', content: 'export default {}' }],
        'preview',
        false,
        true,
      ),
    ).toHaveLength(FILES.length + 1);

    try {
      validateSourceUpload(FILES, 'preview', false, true);
    } catch (error) {
      expect(error).toMatchObject({ missingPaths: ['EDITOR.json', 'EDITOR.ts'] });
    }
  });

  it('keeps legacy revision uploads compatible by default', () => {
    expect(validateSourceUpload(FILES, 'preview')).toHaveLength(FILES.length);
  });
});
