import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { expect, it } from 'vitest';
import { sourceKitBuildDiagnostic, sourceKitWarnings } from './source-kit-diagnostics.js';
import { runLadder } from './verify.js';

it('reports known GameKit mismatches and explains unknown module errors', () => {
  const root = mkdtempSync(join(tmpdir(), 'kit-diagnostics-'));
  const put = (path: string, text: string) => {
    const target = join(root, path);
    mkdirSync(dirname(target), { recursive: true });
    writeFileSync(target, text);
  };
  try {
    put('gamedev-kit.json', JSON.stringify({ engineRef: 'a'.repeat(40), kitSha256: 'b'.repeat(64) }));
    put('src/SPEC.md', '---\nslug: airtime\n---\n');
    put('package.json', JSON.stringify({ scripts: { setup: 'test' } }));
    put('.gamedev/local/.gamedev-slug', 'airtime');
    put('node_modules/@gamedevpl/gamekit/kit.json', JSON.stringify({ engineRef: 'c'.repeat(40) }));
    put('.gamedev/local/kit.json', JSON.stringify({ engineRef: 'a'.repeat(40) }));
    const messages: string[] = [];
    runLadder({
      cwd: root,
      publish: false,
      onStage: (line) => messages.push(line),
      run: () => ({ status: 0, stderr: '' }),
    });
    const warnings = messages.filter((line) => line.startsWith('Warning:'));
    expect(warnings).toEqual(sourceKitWarnings(root));
    expect(warnings).toHaveLength(1);
    expect(warnings[0]).toContain('c'.repeat(40));
    expect(warnings[0]).toContain('a'.repeat(40));
    expect(sourceKitBuildDiagnostic(root, 'Error: Unknown GameKit module: gamepad')).toContain('gamedev-kit.json');
    expect(sourceKitBuildDiagnostic(root, 'Error: Unknown GameKit module: gamepad')).toContain('a'.repeat(40));
    expect(sourceKitBuildDiagnostic(root, 'Other error')).toBe('Other error');
    put('node_modules/@gamedevpl/gamekit/kit.json', '{"engineRef":"unknown"}');
    expect(sourceKitWarnings(root)).toEqual([]);
    put('.gamedev/local/kit.json', JSON.stringify({ engineRef: 'd'.repeat(40) }));
    expect(sourceKitWarnings(root)[0]).toContain('.gamedev/local uses GameKit');
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
