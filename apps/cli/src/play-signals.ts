import type { ApiClient } from './api.js';

export async function withPlaySignals<T>(run: (signal: AbortSignal) => Promise<T>): Promise<T> {
  const controller = new AbortController();
  const stop = () => controller.abort();
  const signals = ['SIGINT', 'SIGTERM', 'SIGHUP'] as const;
  signals.forEach((signal) => process.on(signal, stop));
  try {
    return await run(controller.signal);
  } finally {
    signals.forEach((signal) => process.removeListener(signal, stop));
  }
}

export function playApi(api: ApiClient, shutdown: AbortSignal): ApiClient {
  const combined = (signal?: AbortSignal) => (signal ? AbortSignal.any([shutdown, signal]) : shutdown);
  return {
    ...api,
    request: async (method, path, body, signal) => {
      const active = combined(signal);
      active.throwIfAborted();
      return api.request(method, path, body, active);
    },
    requestBytes: async (path, signal) => {
      const active = combined(signal);
      active.throwIfAborted();
      return api.requestBytes(path, active);
    },
  };
}
