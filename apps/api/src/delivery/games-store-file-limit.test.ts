import { describe, expect, it } from 'vitest';
import { validateSourceUpload, type SourceFile } from './games-store.js';

function delivery(fileCount: number): SourceFile[] {
  const files: SourceFile[] = [
    { path: 'SPEC.md', content: '---\ntitle: Large game\n---\n' },
    { path: 'game.ts', content: 'export {};' },
    {
      path: 'GAME.json',
      content: JSON.stringify({
        engine: { modules: [] },
        howToPlay: {
          goal: { en: 'Survive', pl: 'Przetrwaj' },
          hint: { en: 'Keep moving', pl: 'Nie zatrzymuj się' },
        },
      }),
    },
    { path: 'TRACE.json', content: '{"samples":[]}' },
    { path: 'PLAYTEST.json', content: '{"expectProgress":["round-start"]}' },
    { path: 'AGENT.json', content: '{"policy":"capture"}' },
  ];
  return files.concat(
    Array.from({ length: fileCount - files.length }, (_, index) => ({
      path: `game/module-${index}.ts`,
      content: 'export {};',
    })),
  );
}

describe.each(['preview', 'publish'] as const)('%s delivery file limit', (mode) => {
  it('accepts exactly 300 files', () => {
    expect(validateSourceUpload(delivery(300), mode)).toHaveLength(300);
  });

  it('rejects 301 files with the current limit', () => {
    expect(() => validateSourceUpload(delivery(301), mode)).toThrow('too many files: 301 > 300');
  });
});
