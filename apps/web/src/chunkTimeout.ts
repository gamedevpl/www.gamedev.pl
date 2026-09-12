// Nothing else notices a hung fetch for App's chunk.
export const APP_CHUNK_TIMEOUT_MS = 20_000;

export type ScheduleTimeout = (run: () => void, ms: number) => unknown;

export function withChunkTimeout<T>(chunk: Promise<T>, ms: number, wait: ScheduleTimeout = setTimeout): Promise<T> {
  return Promise.race([
    chunk,
    new Promise<never>((_resolve, reject) => {
      wait(() => reject(new Error('app chunk timed out')), ms);
    }),
  ]);
}
