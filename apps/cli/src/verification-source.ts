import { createHash } from 'node:crypto';
import { localGameFiles } from './checkout.js';

export function verificationSourceHash(root: string, slug: string): string {
  const files = localGameFiles(root, slug).sort((a, b) => a.path.localeCompare(b.path));
  return createHash('sha256').update(JSON.stringify(files)).digest('hex');
}
