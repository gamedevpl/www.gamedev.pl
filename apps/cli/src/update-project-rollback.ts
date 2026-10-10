import { cpSync, lstatSync, mkdirSync, mkdtempSync, renameSync, rmSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { kitPath } from './kit-install.js';

export function projectCliBackup(root: string) {
  const paths = [
    'package.json',
    'package-lock.json',
    'node_modules/.package-lock.json',
    'node_modules/@gamedevpl/cli',
    'node_modules/.bin/gamedevpl',
    'node_modules/.bin/git-remote-gamedevpl',
    ...['gamedevpl', 'git-remote-gamedevpl'].flatMap((bin) => [
      `node_modules/.bin/${bin}.cmd`,
      `node_modules/.bin/${bin}.ps1`,
    ]),
  ];
  const stage = mkdtempSync(join(root, '.gamedev-cli-update-'));
  const entries: Array<{ destination: string; backup?: string }> = [];
  let restored = true;
  try {
    for (const [index, path] of paths.entries()) {
      if (dirname(path) !== '.') kitPath(root, dirname(path));
      const destination = join(root, path);
      try {
        lstatSync(destination);
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
        entries.push({ destination });
        continue;
      }
      const backup = join(stage, String(index));
      cpSync(destination, backup, { recursive: true, verbatimSymlinks: true });
      entries.push({ destination, backup });
    }
  } catch (error) {
    rmSync(stage, { recursive: true, force: true });
    throw error;
  }
  return {
    restore() {
      restored = false;
      for (const { destination, backup } of entries) {
        rmSync(destination, { recursive: true, force: true });
        if (backup) {
          mkdirSync(dirname(destination), { recursive: true });
          renameSync(backup, destination);
        }
      }
      restored = true;
    },
    close() {
      if (restored) rmSync(stage, { recursive: true, force: true });
    },
  };
}
