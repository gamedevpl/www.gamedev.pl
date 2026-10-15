import { spawnSync } from 'node:child_process';
import { remoteImportRef } from './git-history-import.js';

export function knownHistoryCommits(slug: string, cwd = process.cwd(), scope?: string): Map<string, string> {
  const result = spawnSync(
    'git',
    ['for-each-ref', '--format=%(refname) %(objectname)', `${remoteImportRef(slug, scope).slice(0, -4)}versions/`],
    {
      cwd,
      encoding: 'utf8',
      maxBuffer: 8 * 1024 * 1024,
    },
  );
  if (result.status !== 0) return new Map();
  return new Map(
    result.stdout
      .trim()
      .split('\n')
      .flatMap((line) => {
        const [ref, sha] = line.split(' ');
        if (!ref || !sha || !/^[0-9a-f]{40,64}$/.test(sha)) return [];
        return [[Buffer.from(ref.slice(ref.lastIndexOf('/') + 1), 'hex').toString(), sha]];
      }),
  );
}
