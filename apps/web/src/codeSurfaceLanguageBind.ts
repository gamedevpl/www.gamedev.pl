export type LanguageFileService = {
  updateFile: (path: string, code: string) => void;
  deleteFile?: (path: string) => void;
};

export type PendingTsUpdate = { path: string; content: string | null };

export function bindLanguageWorker<
  W extends {
    updateFile(input: { path: string; code: string }): unknown;
    deleteFile(path: string): unknown;
  },
>(worker: W, toVfs: (path: string) => string, destroy: () => void) {
  return {
    worker,
    updateFile: (path: string, code: string) => {
      void worker.updateFile({ path: toVfs(path), code });
    },
    deleteFile: (path: string) => {
      void worker.deleteFile(toVfs(path));
    },
    destroy,
  };
}

export function applyLanguageFileUpdate(service: LanguageFileService, path: string, content: string | null): void {
  if (content === null) service.deleteFile?.(path);
  else service.updateFile(path, content);
}

export function queueLanguageFileUpdate(
  pending: PendingTsUpdate[],
  service: LanguageFileService | null,
  path: string,
  content: string | null,
): void {
  if (!service) {
    pending.push({ path, content });
    return;
  }
  applyLanguageFileUpdate(service, path, content);
}

export function flushLanguageFileUpdates(pending: PendingTsUpdate[], service: LanguageFileService): void {
  const queued = pending.splice(0, pending.length);
  for (const update of queued) applyLanguageFileUpdate(service, update.path, update.content);
}
