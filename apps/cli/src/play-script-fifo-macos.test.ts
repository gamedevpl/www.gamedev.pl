import { execFile } from 'node:child_process';
import { createServer } from 'node:http';
import { mkdtempSync, realpathSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';
import type { AddressInfo } from 'node:net';
import { expect, it, vi } from 'vitest';
import { createPlayScriptClient } from './play-script-client.js';

it.skipIf(process.platform !== 'darwin')(
  'runs the script with OS-level network denial and workspace-only writes',
  async () => {
    const cwd = realpathSync(mkdtempSync(join(tmpdir(), 'play-macos-sandbox-')));
    let reached = false;
    const network = createServer((_req, res) => {
      reached = true;
      res.end('unexpected');
    });
    await new Promise<void>((resolve) => network.listen(0, '127.0.0.1', resolve));
    const port = (network.address() as AddressInfo).port;
    const setup = await createPlayScriptClient({
      cwd,
      signal: new AbortController().signal,
      maxCalls: 5,
      timeoutMs: 30000,
      call: vi.fn(async () => ({ content: [{ type: 'text', text: '{"data":{"value":42}}' }] })),
      release: vi.fn(),
    });
    try {
      const program = `
      import {pathToFileURL} from 'node:url';
      try { await fetch(process.argv[2],{signal:AbortSignal.timeout(1000)}); console.log('NETWORK_ALLOWED'); }
      catch { console.log('NETWORK_DENIED'); }
      const {connect}=await import(pathToFileURL(process.argv[1]).href);
      const client=await connect(); console.log(JSON.stringify(await client.observe())); client.close();
    `;
      const profile = `(version 1) (allow default) (deny network*) (deny file-write*) (allow file-write* (subpath ${JSON.stringify(cwd)}))`;
      const result = await promisify(execFile)(
        '/usr/bin/sandbox-exec',
        [
          '-p',
          profile,
          process.execPath,
          '--input-type=module',
          '-e',
          program,
          setup.modulePath,
          `http://127.0.0.1:${port}/`,
        ],
        { cwd, timeout: 15000 },
      );
      expect(result.stdout).toContain('NETWORK_DENIED');
      expect(result.stdout).toContain('"value":42');
      expect(reached).toBe(false);
    } finally {
      setup.close();
      network.closeAllConnections();
      await new Promise<void>((resolve) => network.close(() => resolve()));
      rmSync(cwd, { recursive: true, force: true });
    }
  },
);
