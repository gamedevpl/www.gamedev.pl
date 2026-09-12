import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, it } from 'vitest';
import { createApi } from './api.js';
import { memoryStore } from './keychain.js';
import { recoverCheckout } from './recover.js';
import { submitGame } from './submit.js';
import { isRecoveryReady } from './recovery-state.js';
it.each([
  ['missing', 'none'],
  ['archived', 'none'],
  ['archived', 'version'],
  ['archived', 'disjoint'],
  ['missing', 'session'],
])('recovers and pushes a large %s checkout within one upload budget', async (kind, change) => {
  const cwd = mkdtempSync(join(tmpdir(), 'recovery-delivery-'));
  try {
    mkdirSync(join(cwd, 'games/sky'), { recursive: true });
    writeFileSync(join(cwd, '.gamedev-slug'), 'sky');
    const files = [
      { path: 'SPEC.md', content: '---\ntitle: Sky Game\n---\nA long enough game description for recovery.' },
      ...Array.from({ length: 179 }, (_, i) => ({ path: `file${i}.ts`, content: `export const a = ${i};` })),
    ];
    for (const file of files) writeFileSync(join(cwd, 'games/sky', file.path), file.content);
    const staged = new Map<string, string>();
    let puts = 0;
    let delivered = false;
    let changed = false;
    const api = createApi({
      origin: 'https://test.example',
      store: memoryStore({ accessToken: 't', tokenType: 'Bearer', scope: 'creator' }),
      fetch: async (url, init) => {
        let body: unknown;
        if (url.endsWith('/recovery')) body = { kind };
        else if (url.endsWith('/recover')) body = { token: 'new', slug: 'sky' };
        else if (url.endsWith('/versions'))
          body = {
            versions:
              delivered || kind === 'archived'
                ? [{ version: changed && (change === 'version' || change === 'disjoint') ? 'v2' : 'v1' }]
                : [],
          };
        else if (url.endsWith('/tree'))
          body = {
            version: changed && change !== 'session' ? 'v2' : 'v1',
            files: delivered
              ? files
              : [
                  { path: 'old.ts', content: changed && change === 'version' ? 'new remote work' : 'old version' },
                  ...(changed && change === 'disjoint' ? [{ path: 'new-remote.ts', content: 'remote addition' }] : []),
                ],
          };
        else if (url.endsWith('/sources/session'))
          body = { locked: false, jobId: changed && change === 'session' ? 3 : 2, generation: 0 };
        else if (url.endsWith('/sources'))
          body = { files: [...staged].map(([path, content]) => ({ path, content, stagedBy: 'owner' })) };
        else if (url.endsWith('/sources/stage')) {
          puts++;
          if (puts > 300) return new Response('{}', { status: 429 });
          const file = JSON.parse(String(init?.body));
          staged.set(file.path, file.content);
          body = { accepted: true };
        } else if (url.endsWith('/stage/delete')) body = { accepted: true };
        else if (url.endsWith('/sources/deliver')) {
          delivered = true;
          body = { accepted: true, version: 'v1' };
        } else throw new Error(url);
        return new Response(JSON.stringify(body));
      },
    });
    await recoverCheckout({ api, cwd, yes: true, write: () => {} });
    expect(isRecoveryReady(cwd, 'sky')).toBe(true);
    changed = change !== 'none';
    if (changed) {
      await expect(
        submitGame({ api, slug: 'sky', dest: cwd, run: () => ({ status: 0, stderr: '' }) }),
      ).rejects.toThrow();
      expect(puts).toBe(180);
      expect(isRecoveryReady(cwd, 'sky')).toBe(true);
      return;
    }
    const result = await submitGame({ api, slug: 'sky', dest: cwd, run: () => ({ status: 0, stderr: '' }) });
    expect(result.kind).toBe('delivered');
    expect(puts).toBe(180);
    expect(isRecoveryReady(cwd, 'sky')).toBe(false);
  } finally {
    rmSync(cwd, { recursive: true, force: true });
  }
});
