import { lstat, readdir, realpath } from 'node:fs/promises';
import { join } from 'node:path';
import { pathInside } from './checkout-sync.js';
import { codeFileAllowed, codeFileRevision, codeProjectId, type CodeCheckout } from './workbench-code-files.js';

export async function readCodeIndex(checkout: CodeCheckout) {
  const root = await realpath(checkout.root);
  const files: { path: string; revision: string; readOnly: boolean }[] = [];
  let visited = 0;
  let bytes = 0n;
  const safe = async (path: string) => {
    const absolute = pathInside(root, path);
    let current = root;
    for (const part of path.split('/')) {
      current = join(current, part);
      if ((await lstat(current)).isSymbolicLink()) throw Error('Symbolic link');
    }
    return absolute;
  };
  const walk = async (path: string) => {
    if (path.split('/').length > 20) throw Error('Project tree exceeds editor limits');
    let entries;
    try {
      entries = await readdir(await safe(path), { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries.sort((a, b) => a.name.localeCompare(b.name))) {
      if (++visited > 20_000) throw Error('Project tree exceeds editor limits');
      if (entry.name.startsWith('.') || entry.isSymbolicLink()) continue;
      const next = `${path}/${entry.name}`;
      if (entry.isDirectory()) await walk(next);
      else if (entry.isFile() && codeFileAllowed(checkout, next)) {
        let stat;
        try {
          stat = await lstat(await safe(next), { bigint: true });
        } catch {
          continue;
        }
        if (!stat.isFile() || stat.nlink !== 1n || stat.size > 1_000_000n) continue;
        bytes += stat.size;
        if (files.length >= 2000 || bytes > 16_000_000n) throw Error('Project exceeds editor limits');
        files.push({ path: next, revision: codeFileRevision(stat), readOnly: next.startsWith('shared/') });
      }
    }
  };
  codeProjectId(checkout);
  await walk(`games/${checkout.slug}`);
  await walk('shared');
  return { projectId: codeProjectId(checkout), files };
}
