import { mkdtempSync, writeFileSync, rmSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, it } from 'vitest';
import { runLadderAsync } from './verify.js';

it('cancels a real verification child and never starts the next stage', async () => {
  const root = mkdtempSync(join(tmpdir(), 'gdpl-verify-abort-'));
  const abort = new AbortController();
  writeFileSync(
    join(root, 'package.json'),
    JSON.stringify({
      scripts: {
        typecheck: 'node wait.cjs',
        'check:static': 'node static.cjs',
      },
    }),
  );
  writeFileSync(join(root, 'wait.cjs'), 'setInterval(() => {}, 1000);');
  writeFileSync(join(root, 'static.cjs'), 'require("node:fs").writeFileSync("unexpected", "ran");');
  const timer = setTimeout(() => abort.abort(), 500);
  try {
    const result = await runLadderAsync({ cwd: root, abort: abort.signal });
    expect(result.ok).toBe(false);
    expect(existsSync(join(root, 'unexpected'))).toBe(false);
  } finally {
    clearTimeout(timer);
    rmSync(root, { recursive: true, force: true });
  }
}, 5000);
