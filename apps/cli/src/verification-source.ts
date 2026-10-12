import { createHash } from 'node:crypto';
import { localGameFiles } from './checkout.js';
import type { TreeFile } from './checkout-sync.js';

export function verificationFilesHash(files: TreeFile[]): string {
  const sorted = [...files].sort((a, b) => a.path.localeCompare(b.path));
  return createHash('sha256').update(JSON.stringify(sorted)).digest('hex');
}

export function verificationSourceHash(root: string, slug: string): string {
  return verificationFilesHash(localGameFiles(root, slug));
}
