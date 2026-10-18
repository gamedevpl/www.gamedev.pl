import { existsSync } from 'node:fs';
import { CliError, EXIT_REFUSED } from './exit-codes.js';
import { kitPath } from './kit-install.js';

export function checkLocalWriter(root: string, options: { resolveMerge?: boolean; recoverHistory?: boolean }) {
  if (!options.recoverHistory && existsSync(kitPath(root, '.gamedev/history-pending.json')))
    throw new CliError('An interrupted source edit needs recovery: gamedevpl restore --recover', EXIT_REFUSED);
  if (!options.resolveMerge && !options.recoverHistory && existsSync(kitPath(root, '.gamedev/merge.json')))
    throw new CliError(
      'A merge is pending. Run gamedevpl resolve, then continue or abort before changing or delivering sources.',
      EXIT_REFUSED,
    );
}
