import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, it } from 'vitest';
import { taskLogTail } from './task-log.js';
it('bounds diagnostic reads and removes terminal escape sequences', () => {
  const root = mkdtempSync(join(tmpdir(), 'gdpl-log-test-'));
  try {
    const path = join(root, 'log');
    writeFileSync(path, 'x'.repeat(100000) + '\n\u001b[2Jlatest\n');
    expect(taskLogTail(path)).toEqual(['latest']);
    writeFileSync(path, Array.from({ length: 300 }, (_, i) => 'line ' + i).join('\n'));
    expect(taskLogTail(path)).toHaveLength(200);
    expect(taskLogTail(path).at(-1)).toBe('line 299');
    expect(taskLogTail(join(root, 'missing'))).toEqual(['Task log unavailable.']);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
