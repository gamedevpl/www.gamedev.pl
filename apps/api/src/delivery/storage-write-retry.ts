export class StorageWriteBusyError extends Error {
  constructor() {
    super('Source storage is temporarily busy. Local files are unchanged; retry delivery shortly.');
    this.name = 'StorageWriteBusyError';
  }
}

export async function retryStorageWrite(send: () => Promise<Response>): Promise<Response> {
  for (let attempt = 0; ; attempt++) {
    const response = await send();
    if (response.status !== 429) return response;
    const after = response.headers.get('retry-after');
    const seconds = after === null ? NaN : Number(after);
    const requested = Number.isFinite(seconds) ? seconds * 1000 : after ? Date.parse(after) - Date.now() : 0;
    const backoff = 1100 * 2 ** attempt + Math.floor(Math.random() * 200);
    const delay = Math.max(backoff, Number.isFinite(requested) ? requested : 0);
    await response.body?.cancel();
    if (attempt === 3 || delay > 10000) throw new StorageWriteBusyError();
    await new Promise((resolve) => setTimeout(resolve, delay));
  }
}
