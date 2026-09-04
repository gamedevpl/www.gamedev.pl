export type LanguageFileService = {
  updateFile: (path: string, code: string) => void;
  deleteFile?: (path: string) => void;
};

export type PendingTsUpdates = Map<string, string | null>;

// Bounds queue growth when the worker never boots (GA-04 latent leak).
const MAX_PENDING_LANGUAGE_FILE_UPDATES = 500;

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
  pending: PendingTsUpdates,
  service: LanguageFileService | null,
  path: string,
  content: string | null,
): void {
  if (!service) {
    pending.delete(path);
    pending.set(path, content);
    while (pending.size > MAX_PENDING_LANGUAGE_FILE_UPDATES) {
      const oldest = pending.keys().next().value;
      if (oldest === undefined) break;
      pending.delete(oldest);
    }
    return;
  }
  applyLanguageFileUpdate(service, path, content);
}

export function flushLanguageFileUpdates(pending: PendingTsUpdates, service: LanguageFileService): void {
  const queued = [...pending];
  pending.clear();
  for (const [path, content] of queued) applyLanguageFileUpdate(service, path, content);
}
