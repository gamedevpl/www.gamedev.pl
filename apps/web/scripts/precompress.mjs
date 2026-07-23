// Build-time precompression: writes .br and .gz siblings for compressible
// files in dist/ so the API can serve them with zero runtime CPU
// (@fastify/static `preCompressed: true` picks them up automatically —
// Cloud Run bills CPU, so we never compress per-request).
// Zero-dependency on purpose: node's zlib does both formats.
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { brotliCompressSync, constants, gzipSync } from 'node:zlib';

const COMPRESSIBLE = new Set(['.js', '.css', '.html', '.svg', '.json', '.txt', '.xml', '.map', '.webmanifest']);
// Below this size the compression headers outweigh the savings.
const MIN_SIZE_BYTES = 1024;

const root = process.argv[2];
if (!root) {
  console.error('usage: node precompress.mjs <dist-dir>');
  process.exit(1);
}

async function* walk(dir) {
  for (const entry of await fs.readdir(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) yield* walk(full);
    else yield full;
  }
}

let done = 0;
for await (const file of walk(root)) {
  if (!COMPRESSIBLE.has(path.extname(file))) continue;
  const content = await fs.readFile(file);
  if (content.length < MIN_SIZE_BYTES) continue;
  await fs.writeFile(
    `${file}.br`,
    brotliCompressSync(content, {
      params: {
        [constants.BROTLI_PARAM_QUALITY]: constants.BROTLI_MAX_QUALITY,
        [constants.BROTLI_PARAM_SIZE_HINT]: content.length,
      },
    }),
  );
  await fs.writeFile(`${file}.gz`, gzipSync(content, { level: constants.Z_BEST_COMPRESSION }));
  done += 1;
}
console.log(`precompress: wrote .br + .gz for ${done} file(s) under ${root}`);
