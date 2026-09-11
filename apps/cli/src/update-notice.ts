import { CLI_BIN } from './bin-name.js';
import { CLI_VERSION, compareSemver, resolveUpdateVersion, type FetchLike } from './update.js';

export function startUpdateNotice(input: {
  write: (line: string) => void;
  currentVersion?: string;
  fetchImpl?: FetchLike;
}): () => void {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 3000);
  timeout.unref?.();
  const current = input.currentVersion ?? CLI_VERSION;
  const stop = (): void => {
    clearTimeout(timeout);
    controller.abort();
  };
  void resolveUpdateVersion({
    fallbackVersion: current,
    fetchImpl: (url, init) => (input.fetchImpl ?? fetch)(url, { ...init, signal: controller.signal }),
  })
    .then((version) => {
      if (!controller.signal.aborted && compareSemver(version, current) > 0) {
        input.write(`Update available: ${CLI_BIN} ${current} → ${version}. Run /update, then restart ${CLI_BIN}.`);
      }
    })
    .catch(() => {})
    .finally(() => clearTimeout(timeout));
  return stop;
}
