import { remoteImportRef } from './git-history-import.js';
import { checkoutGit } from './git-checkout-layout.js';

export function knownHistoryCommits(slug: string, cwd = process.cwd(), scope?: string): Map<string, string> {
  let output: string;
  try {
    output = checkoutGit(cwd)([
      'for-each-ref',
      '--format=%(refname) %(objectname)',
      `${remoteImportRef(slug, scope).slice(0, -4)}versions/`,
    ]).toString();
  } catch {
    return new Map();
  }
  return new Map(
    output
      .trim()
      .split('\n')
      .flatMap((line) => {
        const [ref, sha] = line.split(' ');
        if (!ref || !sha || !/^[0-9a-f]{40,64}$/.test(sha)) return [];
        return [[Buffer.from(ref.slice(ref.lastIndexOf('/') + 1), 'hex').toString(), sha]];
      }),
  );
}
