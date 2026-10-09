import { createHash } from 'node:crypto';
import { readFileSync, readdirSync, lstatSync } from 'node:fs';
import { pathInside } from './checkout-sync.js';

type File = { path: string; data: string };
export function checkpointFiles(root: string): File[] {
  const files: File[] = [];
  let size = 0;
  const walk = (rel: string) => {
    const dir = rel ? pathInside(root, rel) : root;
    if (lstatSync(dir).isSymbolicLink()) throw Error('Checkpoints do not follow symbolic links');
    for (const entry of readdirSync(dir, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
      const name = rel ? `${rel}/${entry.name}` : entry.name;
      if (entry.isSymbolicLink()) throw Error('Checkpoints do not follow symbolic links');
      if (entry.isDirectory()) walk(name);
      else if (entry.isFile()) {
        const bytes = readFileSync(pathInside(root, name));
        size += bytes.length;
        if (size > 32_000_000 || files.length >= 2000) throw Error('Checkpoint exceeds 32 MB or 2000 files');
        files.push({ path: name, data: bytes.toString('base64') });
      }
    }
  };
  walk('');
  return files;
}
export const checkpointDigest = (files: File[]) => createHash('sha256').update(JSON.stringify(files)).digest('hex');
