import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, it } from 'vitest';
import { readBuildSha } from './build-info.js';

it('returns only a full embedded source identity, rejecting absent or malformed identity', () => {
  const root = mkdtempSync(join(tmpdir(), 'api-build-info-'));
  const file = join(root, 'sha');
  try {
    expect(readBuildSha(file)).toBeNull();
    writeFileSync(file, 'master');
    expect(readBuildSha(file)).toBeNull();
    writeFileSync(file, 'A'.repeat(40) + '\n');
    expect(readBuildSha(file)).toBe('a'.repeat(40));
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
