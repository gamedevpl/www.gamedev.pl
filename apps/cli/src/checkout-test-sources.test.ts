import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { ignoredGameFiles, localGameFiles, writeGameFiles } from './checkout.js';

describe('game unit tests in CLI checkouts', () => {
  it('round-trips test sources and includes local test edits in delivery files', () => {
    const root = mkdtempSync(join(tmpdir(), 'gdpl-tests-'));
    const content = "import test from 'node:test';\ntest('model', () => {});\n";
    const files = [
      { path: 'game.ts', content: 'export {};\n' },
      ...['audit.test.ts', 'game/model.spec.ts', 'tests/nested/audit.test.ts'].map((path) => ({ path, content })),
    ];
    const sorted = (tree: typeof files) => [...tree].sort((a, b) => a.path.localeCompare(b.path));
    try {
      writeGameFiles(root, 'audit-game', files);
      expect(sorted(localGameFiles(root, 'audit-game'))).toEqual(sorted(files));
      expect(ignoredGameFiles(root, 'audit-game')).toEqual([]);
      const updated = files.map((file) =>
        file.path === 'game/model.spec.ts' ? { ...file, content: `${content}export const updated = true;\n` } : file,
      );
      writeGameFiles(root, 'audit-game', updated);
      expect(sorted(localGameFiles(root, 'audit-game'))).toEqual(sorted(updated));
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});
