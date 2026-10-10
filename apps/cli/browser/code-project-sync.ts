import { codeApi, CodeRequestError, type CodeFile, type CodeIndex, type CodeProject } from './code-api.js';
import type { CodeSurfaceLanguageService } from '../../web/src/surfaces/studio/codeSurfaceLanguageService.js';

export async function refreshCodeProject(
  previous: CodeProject | null,
  unavailable = new Map<string, string>(),
): Promise<CodeProject> {
  const index = await codeApi<CodeIndex>('/code/project');
  const cached =
    previous?.projectId === index.projectId
      ? new Map(previous.files.map((file) => [file.path, file]))
      : new Map<string, CodeFile>();
  const files: CodeFile[] = [];
  for (let offset = 0; offset < index.files.length; offset += 8) {
    const batch = await Promise.all(
      index.files.slice(offset, offset + 8).map(async (info) => {
        const old = cached.get(info.path);
        if (old?.revision === info.revision) return old;
        const cacheKey = `${index.projectId}/${info.path}`;
        if (unavailable.get(cacheKey) === info.revision) return null;
        try {
          const { file } = await codeApi<{ file: CodeFile }>('/code/file', {
            projectId: index.projectId,
            path: info.path,
          });
          unavailable.delete(cacheKey);
          return file;
        } catch (error) {
          if (error instanceof CodeRequestError && error.status === 415) {
            unavailable.set(cacheKey, info.revision);
            return null;
          }
          throw error;
        }
      }),
    );
    for (const file of batch) if (file) files.push(file);
  }
  return { ...index, files };
}

export function syncCodeLanguageFiles(
  service: CodeSurfaceLanguageService,
  previous: Map<string, string>,
  files: Record<string, string>,
) {
  let changed = false;
  for (const path of previous.keys())
    if (!(path in files)) {
      service.deleteFile?.(path);
      previous.delete(path);
      changed = true;
    }
  for (const [path, content] of Object.entries(files))
    if (previous.get(path) !== content) {
      service.updateFile(path, content);
      previous.set(path, content);
      changed = true;
    }
  return changed;
}
