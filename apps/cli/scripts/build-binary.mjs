import { build } from 'esbuild';
import { chmodSync, mkdirSync, readdirSync } from 'node:fs';
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
  outfile: join(outDir, 'gamedevpl.mjs'),
  packages: 'bundle',
  alias: {
    'react-devtools-core': join(root, 'scripts/empty-devtools.mjs'),
  },
  banner: {
    js: '#!/usr/bin/env node\nimport { createRequire } from "node:module";\nconst require = createRequire(import.meta.url);',
  },
});

chmodSync(join(outDir, 'gamedevpl.mjs'), 0o755);
const wasm = readdirSync(outDir).filter((name) => name.endsWith('.wasm'));
if (wasm.length) throw new Error(`bundle emitted sidecar wasm: ${wasm.join(', ')}`);
console.log('bundled dist/gamedevpl.mjs — shebang Node script, Ink+yoga inlined');
