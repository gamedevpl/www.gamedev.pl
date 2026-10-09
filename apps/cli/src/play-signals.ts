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
