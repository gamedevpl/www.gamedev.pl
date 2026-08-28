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
