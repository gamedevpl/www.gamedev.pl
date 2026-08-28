import { deleteCodeSurfaceFile, stageCodeSurfaceFile } from './codeSurfaceApi.js';

export type TreeWrite = { path: string; content: string };

export async function applyTreeMutation(options: {
  slug: string;
  writes: TreeWrite[];
  deletes: string[];
}): Promise<void> {
  const destinations = new Set(options.writes.map((file) => file.path));
  for (const file of options.writes) {
    await stageCodeSurfaceFile(options.slug, file.path, file.content, { rebuild: false });
  }
  for (const path of options.deletes) {
    if (destinations.has(path)) continue;
    await deleteCodeSurfaceFile(options.slug, path);
  }
}

export function mergeMutationDrafts(
  current: Record<string, string>,
  writes: TreeWrite[],
  deletes: string[],
): Record<string, string> {
  const next = { ...current };
  for (const path of deletes) delete next[path];
  for (const file of writes) next[file.path] = file.content;
  return next;
}

export function draftsFromServer(
  current: Record<string, string>,
  files: Array<{ path: string; content: string }>,
  touched: string[],
): Record<string, string> {
  const next = { ...current };
  const byPath = new Map(files.map((file) => [file.path, file.content]));
  for (const path of touched) {
    const live = byPath.get(path);
    if (live === undefined) delete next[path];
    else next[path] = live;
  }
  return next;
}

export function forEachTsPath(
  paths: string[],
  contentOf: (path: string) => string | null,
  visit: (path: string, content: string | null) => void,
): void {
  for (const path of paths) {
    if (path.endsWith('.ts') || path.endsWith('.tsx')) visit(path, contentOf(path));
  }
}
