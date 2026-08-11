import type { WorkerShape } from '@valtown/codemirror-ts/worker';
import * as Comlink from 'comlink';

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
   * the open file's own edits are covered by tsSync(), this is for the rest. */
  updateFile: (path: string, code: string) => void;
  destroy: () => void;
};

export async function createCodeSurfaceLanguageService(
  files: Record<string, string>,
  kitDeclaration: string | null,
): Promise<CodeSurfaceLanguageService | null> {
  let innerWorker: Worker | null = null;
  try {
    innerWorker = new Worker(new URL('./tsWorker.ts', import.meta.url), { type: 'module' });
    const worker = Comlink.wrap<WorkerShape>(innerWorker);
    await worker.initialize();
    if (kitDeclaration) await worker.updateFile({ path: 'shared/game-kit.d.ts', code: kitDeclaration });
    await Promise.all(Object.entries(files).map(([path, code]) => worker.updateFile({ path, code })));
    return {
      worker,
      updateFile: (path, code) => {
        void worker.updateFile({ path, code });
      },
      destroy: () => innerWorker?.terminate(),
    };
  } catch {
    innerWorker?.terminate();
    return null;
  }
}
