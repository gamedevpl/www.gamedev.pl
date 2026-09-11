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
  it.each(['preview', 'publish'] as const)('requires compiled EDITOR.json for %s delivery', (mode) => {
    expect(() => validateSourceUpload(FILES, mode, false, true)).toThrow(/EDITOR\.json is required/);
  });

  it('accepts compiled JSON and rejects authoring source alone', () => {
    expect(
      validateSourceUpload([...FILES, { path: 'EDITOR.json', content: '{}' }], 'preview', false, true),
    ).toHaveLength(FILES.length + 1);
    expect(() =>
      validateSourceUpload(
        [...FILES, { path: 'EDITOR.ts', content: 'export default {}' }],
        'preview',
        false,
        true,
      ),
    ).toThrow(/EDITOR\.json is required/);

    try {
      validateSourceUpload(FILES, 'preview', false, true);
    } catch (error) {
      expect(error).toMatchObject({ missingPaths: ['EDITOR.json'] });
    }
  });

  it('requires the content document paired with a fresh v2 declaration', () => {
    const v2Files = [...FILES, { path: 'EDITOR.json', content: '{"version":2}' }];

    expect(() => validateSourceUpload(v2Files, 'preview', false, true)).toThrow(
      /EDITOR\.content\.json is required/,
    );
    try {
      validateSourceUpload(v2Files, 'preview', false, true);
    } catch (error) {
      expect(error).toMatchObject({ missingPaths: ['EDITOR.content.json'] });
    }

    expect(
      validateSourceUpload(
        [...v2Files, { path: 'EDITOR.content.json', content: '{"params":{}}' }],
        'preview',
        false,
        true,
      ),
    ).toHaveLength(v2Files.length + 1);
  });

  it('keeps v1 and malformed declarations on their existing gate-validation path', () => {
    expect(
      validateSourceUpload([...FILES, { path: 'EDITOR.json', content: '{"version":1}' }], 'preview', false, true),
    ).toHaveLength(FILES.length + 1);
    expect(
      validateSourceUpload([...FILES, { path: 'EDITOR.json', content: '{' }], 'preview', false, true),
    ).toHaveLength(FILES.length + 1);
  });

  it('keeps legacy revision uploads compatible by default', () => {
    expect(validateSourceUpload(FILES, 'preview')).toHaveLength(FILES.length);
  });
});
