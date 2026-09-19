import { createHash } from 'node:crypto';
import type { ApiClient } from './api.js';
import type { PreviewSnapshot } from './local-preview-source.js';

export function platformPreview(api: ApiClient, token: string) {
  let cached: PreviewSnapshot | undefined,
    checked = 0,
    inflight: Promise<PreviewSnapshot> | undefined;
  const snapshot = () => {
    if (cached && Date.now() - checked < 5000) return Promise.resolve(cached);
    return (inflight ??= api
      .request<{ html: string }>('GET', `/api/submissions/${encodeURIComponent(token)}/preview`)
      .then((value) => {
        if (typeof value.html !== 'string' || value.html.length > 32 * 1024 * 1024)
          throw Error('Invalid platform preview');
        checked = Date.now();
        return (cached = { html: value.html, revision: createHash('sha256').update(value.html).digest('hex') });
      })
      .finally(() => {
        inflight = undefined;
      }));
  };
  return {
    snapshot,
    async status() {
      const value = await snapshot();
      return { revision: value.revision, busy: false, stale: false, error: '' };
    },
  };
}
