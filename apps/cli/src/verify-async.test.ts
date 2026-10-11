import { mkdtempSync, writeFileSync, readFileSync, rmSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, it } from 'vitest';
import { runLadderAsync } from './verify.js';

it('forwards the selected slug through npm to real publication checks', async () => {
  const root = mkdtempSync(join(tmpdir(), 'gdpl-verify-slug-'));
  try {
    writeFileSync(join(root, '.gamedev-slug'), 'another-game');
    writeFileSync(
      join(root, 'package.json'),
      JSON.stringify({
        scripts: {
          typecheck: 'node check.cjs types',
          'check:static': 'node check.cjs static',
          'check:game': 'node check.cjs publish',
        },
      }),
    );
    writeFileSync(
      join(root, 'check.cjs'),
      `const [stage, slug, ...rest] = process.argv.slice(2);
if (slug !== 'trenchline-command' || rest.length) throw Error('Usage: check <slug>');
require('node:fs').appendFileSync('checks.txt', stage + ':' + slug + '\\n');`,
    );
    const result = await runLadderAsync({
      cwd: root,
      slug: 'trenchline-command',
      publish: true,
      abort: new AbortController().signal,
    });
    expect(result).toEqual({ ok: true });
    expect(readFileSync(join(root, 'checks.txt'), 'utf8')).toBe(
      'types:trenchline-command\nstatic:trenchline-command\npublish:trenchline-command\n',
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

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
