import { createHash } from 'node:crypto';
import { setTimeout as delay } from 'node:timers/promises';

export type PreviewStatus = { revision: string; busy: boolean; error: string; stale: boolean };
export type PreviewSnapshot = { html: string; revision: string };

export function previewSource(url: string, signal: AbortSignal) {
  const parsed = new URL(url);
  if (parsed.protocol !== 'http:' || parsed.hostname !== '127.0.0.1' || !/^\/[a-f0-9]{48}\/$/.test(parsed.pathname)) {
    throw new Error('Local tools require a CLI-owned loopback preview.');
  }
  if (parsed.username || parsed.password || parsed.search || parsed.hash) throw new Error('Invalid preview URL.');
  async function read(path: string, limit: number): Promise<string> {
    const response = await fetch(`${url}${path}`, {
      redirect: 'error',
      signal: AbortSignal.any([signal, AbortSignal.timeout(5000)]),
    });
    if (!response.ok || !response.body) throw new Error(`Preview unavailable (${response.status}).`);
    const reader = response.body.getReader();
    const chunks: Uint8Array[] = [];
    let size = 0;
    try {
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        size += value.length;
        if (size > limit) throw new Error('Preview response exceeds the local tools limit.');
        chunks.push(value);
      }
    } finally {
      await reader.cancel();
    }
    return Buffer.concat(chunks).toString('utf8');
  }
  async function status(): Promise<PreviewStatus> {
    const value = JSON.parse(await read('status', 16_384)) as PreviewStatus;
    if (typeof value.revision !== 'string' || typeof value.busy !== 'boolean' || typeof value.error !== 'string') {
      throw new Error('Invalid preview status.');
    }
    if (typeof value.stale !== 'boolean') throw new Error('Restart /play to enable versioned local captures.');
    return { revision: value.revision, busy: value.busy, error: value.error.slice(0, 4000), stale: value.stale };
  }
  async function snapshot(): Promise<PreviewSnapshot> {
    const deadline = Date.now() + 45_000;
    while (Date.now() < deadline) {
      signal.throwIfAborted();
      const before = await status();
      if (before.error && !before.busy) throw new Error(before.error);
      if (!before.busy && !before.stale && before.revision) {
        const html = await read('game', 32 * 1024 * 1024);
        const after = await status();
        if (
          !after.busy &&
          !after.stale &&
          !after.error &&
          before.revision === after.revision &&
          createHash('sha256').update(html).digest('hex') === after.revision
        ) {
          return { html, revision: after.revision };
        }
      }
      await delay(250, undefined, { signal });
    }
    throw new Error('No current playable build within 45 seconds. Fix build errors and retry.');
  }
  return { status, snapshot };
}

export const CAPTURE_CSP =
  "default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; img-src data: blob:; media-src data: blob:; frame-src about:; connect-src 'none'; object-src 'none'; base-uri 'none'; form-action 'none'";
export function capturePage(html: string): string {
  const document = JSON.stringify(html).replace(/</g, '\\u003c');
  return `<!doctype html><html><head><meta name="viewport" content="width=device-width, initial-scale=1"><style>html,body,iframe{margin:0;width:100%;height:100%;border:0;overflow:hidden}</style></head><body><iframe title="Game capture" sandbox="allow-scripts allow-pointer-lock"></iframe><script>document.querySelector('iframe').srcdoc=${document};</script></body></html>`;
}
