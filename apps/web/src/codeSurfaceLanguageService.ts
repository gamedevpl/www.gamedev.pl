import type { WorkerShape } from '@valtown/codemirror-ts/worker';
import { bindLanguageWorker } from './codeSurfaceLanguageBind.js';

// Main-thread half of GA-02's worker. Advisory only, never gates.

export type CodeSurfaceLanguageService = {
  // Bound into `tsFacet` by CodeMirrorEditor.tsx.
  worker: Omit<WorkerShape, 'initialize'>;
  // Seeds/edits a sibling file — open-file edits go through tsSync().
  updateFile: (path: string, code: string) => void;
  deleteFile?: (path: string) => void;
  destroy: () => void;
};

// vfs roots every path at "/" (tsWorker.ts); unrooted paths break relative imports.
export function toVfsPath(path: string): string {
  return path.startsWith('/') ? path : `/${path}`;
}

// Inverse of toVfsPath — GA-09 goto-definition targets come back vfs-rooted.
export function fromVfsPath(path: string): string {
  return path.startsWith('/') ? path.slice(1) : path;
}

// The kit's vfs path — shared with GA-09's hop.
export const KIT_DECLARATION_PATH = 'shared/game-kit.d.ts';

export async function createCodeSurfaceLanguageService(
  files: Record<string, string>,
  kitDeclaration: string | null,
): Promise<CodeSurfaceLanguageService | null> {
  let innerWorker: Worker | null = null;
  try {
    // Dynamic import: static `import 'comlink'` here would leak into the main bundle.
    const Comlink = await import('comlink');
    innerWorker = new Worker(new URL('./tsWorker.ts', import.meta.url), { type: 'module' });
    const worker = Comlink.wrap<WorkerShape & { deleteFile(path: string): void }>(innerWorker);
    await worker.initialize();
    if (kitDeclaration) {
      await worker.updateFile({ path: toVfsPath(KIT_DECLARATION_PATH), code: kitDeclaration });
    }
    await Promise.all(Object.entries(files).map(([path, code]) => worker.updateFile({ path: toVfsPath(path), code })));
    return bindLanguageWorker(worker, toVfsPath, () => innerWorker?.terminate());
  } catch {
    innerWorker?.terminate();
    return null;
  }
}
