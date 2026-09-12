// One reload, then a button; a loop survives nothing.
const RELOAD_MARK = 'gamedev:app-chunk-reload';

export function appChunkReloadAllowed(storage: Pick<Storage, 'getItem' | 'setItem'>): boolean {
  try {
    if (storage.getItem(RELOAD_MARK)) return false;
    storage.setItem(RELOAD_MARK, '1');
    return true;
  } catch {
    // Private mode throws; a manual reload is offered.
    return false;
  }
}
