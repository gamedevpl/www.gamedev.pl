import { gzipSync } from 'node:zlib';
import { KIT_ROOT_DIR } from '../platform/kit-registry.js';

const BLOCK = 512;
export const KIT_TEST_ENGINE = 'deadbeef0123456789abcdef0123456789abcdef';
export const KIT_TEST_SHA = 'a'.repeat(64);

function entryBlocks(name: string, body: Buffer | string): Buffer {
  const payload = Buffer.isBuffer(body) ? body : Buffer.from(body, 'utf8');
  const header = Buffer.alloc(BLOCK);
  header.write(name, 0, 100, 'utf8');
  header.write(`${payload.length.toString(8).padStart(11, '0')} `, 124, 12, 'utf8');
  header.write('0', 156, 1, 'utf8');
  header.write('ustar\0', 257, 6, 'utf8');
  const padding = Buffer.alloc((BLOCK - (payload.length % BLOCK)) % BLOCK);
  return Buffer.concat([header, payload, padding]);
}

export function kitTarball(files: Record<string, Buffer | string>): Buffer {
  const entries = Object.entries(files).map(([name, body]) =>
    entryBlocks(name.startsWith(`${KIT_ROOT_DIR}/`) ? name : `${KIT_ROOT_DIR}/${name}`, body),
  );
  return gzipSync(Buffer.concat([...entries, Buffer.alloc(BLOCK * 2)]));
}
