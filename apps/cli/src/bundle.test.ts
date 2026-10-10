import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { statSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

describe('cli bundle', () => {
  it('resolves ink from the CLI package', () => {
    const require = createRequire(join(root, 'package.json'));
    expect(require.resolve('ink')).toMatch(/ink/);
  });

  it('runs help through node on the shebang bundle', () => {
    execFileSync(process.execPath, [join(root, 'scripts/build-binary.mjs')], {
      cwd: root,
      timeout: 20_000,
    });
    const out = execFileSync(process.execPath, [join(root, 'dist/gamedevpl.mjs'), 'help'], {
      encoding: 'utf8',
      timeout: 8000,
    });
    expect(out).toMatch(/gamedevpl/);
    expect(statSync(join(root, 'dist/gamedevpl.mjs')).size).toBeLessThan(4_500_000);
    expect(statSync(join(root, 'dist/generated/play-typescript-worker.js.gz')).size).toBeLessThan(2_000_000);
  }, 30_000);
});
