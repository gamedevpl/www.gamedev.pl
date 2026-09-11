import { closeSync, constants, fstatSync, lstatSync, mkdirSync, openSync, readFileSync } from 'node:fs';
import { CliError, EXIT_REFUSED } from './exit-codes.js';

export function privatePlayDirectory(path: string): string {
  try {
    mkdirSync(path, { mode: 0o700 });
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error;
  }
  const stat = lstatSync(path);
  if (
    !stat.isDirectory() ||
    stat.isSymbolicLink() ||
    (process.getuid && (stat.uid !== process.getuid() || (stat.mode & 0o777) !== 0o700))
  ) {
    throw new CliError('unsafe preview directory: owner-only directory required', EXIT_REFUSED);
  }
  return path;
}

export function readPlayState(path: string): string | null {
  let fd: number;
  try {
    fd = openSync(path, constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0));
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null;
    throw new CliError('unsafe or unreadable preview state', EXIT_REFUSED);
  }
  try {
    const stat = fstatSync(fd);
    if (
      !stat.isFile() ||
      lstatSync(path).isSymbolicLink() ||
      stat.nlink !== 1 ||
      (process.getuid && (stat.uid !== process.getuid() || (stat.mode & 0o077) !== 0))
    ) {
      throw new CliError('unsafe preview state: private regular file required', EXIT_REFUSED);
    }
    return readFileSync(fd, 'utf8');
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null;
    throw error;
  } finally {
    closeSync(fd);
  }
}

export function lockAge(path: string): number | null {
  try {
    return Date.now() - lstatSync(path).mtimeMs;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null;
    throw error;
  }
}
