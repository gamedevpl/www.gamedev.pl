import { mkdtempSync, mkdirSync, readFileSync, writeFileSync, rmSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, it, vi } from 'vitest';
import { createApi } from './api.js';
import { memoryStore } from './keychain.js';
import { connectGame } from './connect.js';
import { findCheckout } from './checkout.js';

it.each(['claude', 'copilot', 'codex'])(
  'binds an unbased source repository before directly launching %s',
  async (agent) => {
    const root = mkdtempSync(join(tmpdir(), 'source-direct-agent-'));
    mkdirSync(join(root, 'src'));
    writeFileSync(
      join(root, 'gamedev-kit.json'),
      JSON.stringify({ engineRef: 'a'.repeat(40), kitSha256: 'b'.repeat(64) }),
    );
    writeFileSync(join(root, 'src/SPEC.md'), '---\nslug: airtime\n---\n');
    const api = createApi({
      origin: 'https://example.test',
      store: memoryStore({ accessToken: 't' }),
      fetch: async (url) =>
        new Response(
          JSON.stringify(
            url.includes('/api/me/studio')
              ? { games: [{ slug: 'airtime', token: 'tok' }] }
              : { mcpUrl: 'https://example.test/api/mcp', authorizationHeader: 'Bearer gdpl_cak_test' },
          ),
        ),
    });
    const launch = vi.fn(async ({ cwd }: { cwd: string }) => {
      expect(cwd).toBe(join(root, 'src'));
      expect(readFileSync(join(root, '.gamedev/source-slug'), 'utf8').trim()).toBe('airtime');
      writeFileSync(join(root, 'src/SPEC.md'), '---\nslug: sky\n---\n');
      return { code: 0 };
    });
    try {
      expect(existsSync(join(root, '.gamedev-base.json'))).toBe(false);
      expect(existsSync(join(root, '.gamedev/local'))).toBe(false);
      await connectGame({
        api,
        slug: 'airtime',
        dest: join(root, 'src'),
        agent,
        env: { PATH: '' },
        which: () => `/bin/${agent}`,
        write: () => {},
        runAdapter: launch,
        ...(agent === 'codex' ? { interactiveRun: launch } : {}),
      });
      expect(launch).toHaveBeenCalledTimes(1);
      expect(() => findCheckout(root)).toThrow('Invalid source repository metadata');
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  },
);
