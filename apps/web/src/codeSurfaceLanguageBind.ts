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
