// Nothing else notices a hung fetch for App's chunk.
export const APP_CHUNK_TIMEOUT_MS = 20_000;

export function withChunkTimeout<T>(chunk: Promise<T>, ms: number, wait = setTimeout): Promise<T> {
  return Promise.race([
    chunk,
    new Promise<never>((_resolve, reject) => {
      wait(() => reject(new Error('app chunk timed out')), ms);
    }),
  ]);
}
