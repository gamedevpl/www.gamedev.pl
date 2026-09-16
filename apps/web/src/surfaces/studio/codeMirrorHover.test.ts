import { describe, expect, it, vi } from 'vitest';
import type { EditorView } from '@codemirror/view';
import type { HoverInfo } from '@valtown/codemirror-ts';
import ts from 'typescript';
import { makeGotoHandler, pickGotoDefinition } from './codeMirrorHover.js';

function span(fileName: string, start = 0, length = 12): NonNullable<HoverInfo['def']>[number] {
  return { fileName, textSpan: { start, length } } as NonNullable<HoverInfo['def']>[number];
}

function hover(partial: Pick<HoverInfo, 'def' | 'typeDef'>): HoverInfo {
  return { start: 9, end: 21, quickInfo: undefined, ...partial };
}

describe('pickGotoDefinition', () => {
  it('follows def into editor-def even when typeDef is Record in lib', () => {
    const info = hover({
      typeDef: [span('/lib.es5.d.ts', 74243, 20)],
      def: [span('/shared/editor-def.ts', 128, 12)],
    });
    expect(pickGotoDefinition(info)?.fileName).toBe('/shared/editor-def.ts');
  });

  it('skips worker-rooted lib paths too', () => {
    const info = hover({
      typeDef: [span('/lib.es2022.d.ts', 10, 6)],
      def: [span('/shared/editor-def.ts', 0, 12)],
    });
    expect(pickGotoDefinition(info)?.fileName).toBe('/shared/editor-def.ts');
  });

  it('falls back to a kit typeDef when def is missing', () => {
    const info = hover({
      typeDef: [span('/shared/game-kit.d.ts', 34, 3)],
      def: undefined,
    });
    expect(pickGotoDefinition(info)?.fileName).toBe('/shared/game-kit.d.ts');
  });

  it('ignores a hover that only type-defines into lib', () => {
    expect(pickGotoDefinition(hover({ typeDef: [span('/lib.es5.d.ts')], def: undefined }))).toBeUndefined();
  });
});

describe('makeGotoHandler', () => {
  it('opens editor-def instead of swallowing a lib typeDef', () => {
    const onGoto = vi.fn();
    const view = { dispatch: vi.fn() } as unknown as EditorView;
    const handled = makeGotoHandler({ current: onGoto })(
      '/EDITOR.ts',
      hover({
        typeDef: [span('/lib.es5.d.ts', 74243, 20)],
        def: [span('/shared/editor-def.ts', 128, 12)],
      }),
      view,
    );
    expect(handled).toBe(true);
    expect(view.dispatch).not.toHaveBeenCalled();
    expect(onGoto).toHaveBeenCalledWith('/shared/editor-def.ts', 128, 140);
  });

  it('selects in place when def is in the open file', () => {
    const onGoto = vi.fn();
    const view = { dispatch: vi.fn() } as unknown as EditorView;
    makeGotoHandler({ current: onGoto })(
      '/game.ts',
      hover({ def: [span('/game.ts', 4, 4)], typeDef: undefined }),
      view,
    );
    expect(onGoto).not.toHaveBeenCalled();
    expect(view.dispatch).toHaveBeenCalledWith({ selection: { anchor: 4, head: 8 } });
  });
});

describe('TypeScript definition of defineEditor', () => {
  it('puts Record in typeDef and the function in def', () => {
    const editor = `import { defineEditor } from '../../shared/editor-def.ts';
export default defineEditor({});
`;
    const files = new Map<string, string>([
      ['/EDITOR.ts', editor],
      [
        '/shared/editor-def.ts',
        `export type EditorDefinitionInput = { minCols?: number };
export function defineEditor(input: EditorDefinitionInput): Record<string, unknown> {
  return input;
}
`,
      ],
    ]);
    const options: ts.CompilerOptions = {
      noEmit: true,
      strict: true,
      target: ts.ScriptTarget.ES2022,
      module: ts.ModuleKind.ESNext,
      moduleResolution: ts.ModuleResolutionKind.Bundler,
      allowImportingTsExtensions: true,
      lib: ['lib.es2022.d.ts'],
    };
    const ls = ts.createLanguageService({
      getCompilationSettings: () => options,
      getScriptFileNames: () => [...files.keys()],
      getScriptVersion: () => '1',
      getScriptSnapshot: (name) => {
        const text = files.get(name) ?? ts.sys.readFile(name);
        return text === undefined ? undefined : ts.ScriptSnapshot.fromString(text);
      },
      getCurrentDirectory: () => '/',
      getDefaultLibFileName: (opts) => ts.getDefaultLibFilePath(opts),
      readFile: (name) => files.get(name) ?? ts.sys.readFile(name),
      fileExists: (name) => files.has(name) || ts.sys.fileExists(name),
    });
    const pos = editor.indexOf('defineEditor');
    const info: HoverInfo = {
      start: pos,
      end: pos + 12,
      def: ls.getDefinitionAtPosition('/EDITOR.ts', pos),
      typeDef: ls.getTypeDefinitionAtPosition('/EDITOR.ts', pos),
      quickInfo: ls.getQuickInfoAtPosition('/EDITOR.ts', pos),
    };
    expect(info.quickInfo).toBeTruthy();
    expect(info.typeDef?.[0]?.fileName).toMatch(/lib\..+\.d\.ts$/);
    expect(pickGotoDefinition(info)?.fileName).toBe('/shared/editor-def.ts');
  });
});
