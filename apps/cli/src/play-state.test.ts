import { chmodSync, mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, expect, it, vi } from 'vitest';
import { lockAge, privatePlayDirectory, readPlayState } from './play-state.js';
const roots: string[] = [];
function root() {
  const path = mkdtempSync(join(tmpdir(), 'gdpl-state-test-'));
  roots.push(path);
  return path;
}
afterEach(() => {
  for (const path of roots.splice(0)) rmSync(path, { recursive: true, force: true });
});
it('rejects a symlinked registry without following it', () => {
  const dir = root(),
    target = join(dir, 'target'),
    link = join(dir, 'link');
  mkdirSync(target, { mode: 0o700 });
  symlinkSync(target, link);
  expect(() => privatePlayDirectory(link)).toThrow('unsafe preview directory');
});
it.skipIf(!process.getuid)('rejects a registry accessible by other users', () => {
  const dir = root();
  chmodSync(dir, 0o777);
  expect(() => privatePlayDirectory(dir)).toThrow('owner-only');
});
it('rejects a substituted state file and accepts private regular files', () => {
  const dir = root(),
    target = join(dir, 'target'),
    state = join(dir, 'state');
  writeFileSync(target, '{}', { mode: 0o600 });
  symlinkSync(target, state);
  expect(() => readPlayState(state)).toThrow('unsafe');
  rmSync(state);
  writeFileSync(state, '{}', { mode: 0o600 });
  expect(readPlayState(state)).toBe('{}');
});
it('retries a lock removed by another starter', () => {
  const lock = join(root(), 'lock');
  mkdirSync(lock);
  rmSync(lock, { recursive: true });
  expect(lockAge(lock)).toBeNull();
});

it.skipIf(!process.getuid)('rejects a registry owned by another uid', () => {
  const dir = root(),
    uid = process.getuid!();
  const mocked = vi.spyOn(process, 'getuid').mockReturnValue(uid + 1);
  try {
    expect(() => privatePlayDirectory(dir)).toThrow('owner-only');
  } finally {
    mocked.mockRestore();
  }
});
