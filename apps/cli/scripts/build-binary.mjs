import { build } from 'esbuild';
import { chmodSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const outDir = join(root, 'dist');
mkdirSync(outDir, { recursive: true });

await build({
  entryPoints: [join(root, 'src/main.ts')],
  bundle: true,
  platform: 'node',
  target: 'node20',
  format: 'esm',
  outfile: join(outDir, 'gamedev.mjs'),
  banner: { js: '#!/usr/bin/env node' },
  packages: 'bundle',
});

chmodSync(join(outDir, 'gamedev.mjs'), 0o755);
console.log('bundled dist/gamedev.mjs — self-contained binaries: scripts/compile-release.sh (needs bun)');
