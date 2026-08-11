import type { WorkerShape } from '@valtown/codemirror-ts/worker';

/**
 * GA-04: the main-thread half of GA-02's worker. Advisory only (§1.1 of the
 * autocomplete plan) — nothing this produces is submitted or gates anything; the
 * server typecheck stays the one authoritative check. Every failure path here
 * resolves to `null` rather than throwing, so a worker that can't load or init
 * degrades to plain editing (GA-06), never a blocked panel.
 */

export type CodeSurfaceLanguageService = {
  /** Bound into `tsFacet` by CodeMirrorEditor.tsx. */
  worker: Omit<WorkerShape, 'initialize'>;
  /** Seeds or edits a sibling file so cross-file completions/hovers stay accurate —
   * the open file's own edits are covered by tsSync(), this is for the rest. Takes
   * the game's own relative path (e.g. `game/render.ts`) — `toVfsPath` below is
   * applied internally, callers never need to think about the vfs's own rooting. */
  updateFile: (path: string, code: string) => void;
  destroy: () => void;
};

/**
 * @typescript/vfs roots every path at "/" — its `getDefaultLibFileName()` asks the
 * system for `/lib.es2022.d.ts`, not the bare name (tsWorker.ts's lib loading mirrors
 * this). A game file registered as `game/render.ts` instead of `/game/render.ts`
 * still "exists" as a root file, but a *relative import* from it (`../shared/game-kit`)
 * resolves against an unrooted path and never finds the sibling — every path crossing
 * into the worker goes through this one place so that failure mode can't recur.
 */
export function toVfsPath(path: string): string {
  return path.startsWith('/') ? path : `/${path}`;
}

export async function createCodeSurfaceLanguageService(
  files: Record<string, string>,
  kitDeclaration: string | null,
): Promise<CodeSurfaceLanguageService | null> {
  let innerWorker: Worker | null = null;
  try {
    // Dynamic, not a top-level import: this module is pulled in eagerly by
    // CodeSurface.tsx (only CodeMirrorEditor.tsx is behind React.lazy — see its own
    // header comment), so a static `import 'comlink'` here would leak comlink's
    // bytes into the main bundle for every visitor, not just an open, editable Code
    // surface. GA-07's bundle check is what caught this the first time.
    const Comlink = await import('comlink');
    innerWorker = new Worker(new URL('./tsWorker.ts', import.meta.url), { type: 'module' });
    const worker = Comlink.wrap<WorkerShape>(innerWorker);
    await worker.initialize();
    if (kitDeclaration) {
      await worker.updateFile({ path: toVfsPath('shared/game-kit.d.ts'), code: kitDeclaration });
    }
    await Promise.all(Object.entries(files).map(([path, code]) => worker.updateFile({ path: toVfsPath(path), code })));
    return {
      worker,
      updateFile: (path, code) => {
        void worker.updateFile({ path: toVfsPath(path), code });
      },
      destroy: () => innerWorker?.terminate(),
    };
  } catch {
    innerWorker?.terminate();
    return null;
  }
}
