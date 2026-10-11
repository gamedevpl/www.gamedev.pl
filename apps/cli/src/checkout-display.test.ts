import { describe, expect, it } from 'vitest';
import { formatCheckoutDiff, formatCheckoutStatus } from './checkout-display.js';
import { checkoutLineStyle, colorCheckoutLines } from './checkout-style.js';
import { formatPatches } from './working-copy.js';
import type { DiffReport } from './checkout.js';

function report(overrides: Partial<DiffReport> = {}): DiffReport {
  return {
    kind: 'clean',
    version: 'v1',
    local: [],
    platform: [],
    conflict: [],
    ignored: [],
    patches: [],
    incoming: { blocked: [], absent: [], git: [] },
    ...overrides,
  };
}

describe('checkout presentation', () => {
  it('lists additions, deletions and modifications separately from incoming changes and conflicts', () => {
    const sync = report({
      kind: 'conflict',
      local: ['add.ts', 'delete.ts', 'edit.ts'],
      platform: ['remote.ts'],
      conflict: ['both.ts'],
    });
    const local = [
      { path: 'add.ts', content: '' },
      { path: 'edit.ts', content: 'new' },
      { path: 'both.ts', content: 'mine' },
    ];
    const remote = [
      { path: 'delete.ts', content: 'old' },
      { path: 'edit.ts', content: 'old' },
      { path: 'remote.ts', content: 'incoming' },
      { path: 'both.ts', content: 'theirs' },
    ];
    const output = formatCheckoutStatus({ ...sync, patches: formatPatches(sync, local, remote) }, 'example').join('\n');
    expect(output).toContain('  new file: add.ts');
    expect(output).toContain('  deleted: delete.ts');
    expect(output).toContain('  modified: edit.ts');
    expect(output).toContain('  incoming: new file: remote.ts');
    expect(output).toContain('  both changed: both.ts');
    expect(output).toContain('gamedevpl diff');
    expect(output).toContain('gamedevpl push');
    expect(output).toContain('gamedevpl pull');
  });

  it('shows a clean state and keeps ignored blockers and missing-base warnings visible', () => {
    expect(formatCheckoutStatus(report(), 'example').join('\n')).toContain('Working tree clean');
    const legacy = report({ kind: 'legacy', incoming: { blocked: ['scratch.ts'], absent: [], git: [] } });
    expect(formatCheckoutStatus(legacy, 'example').join('\n')).toContain('Checkout has no base version');
    expect(formatCheckoutStatus(legacy, 'example')).toContain('  blocked: scratch.ts');
  });

  it('adds colors only at terminal output and preserves patch bytes in plain output', () => {
    const lines = formatCheckoutDiff(
      report({
        patches: [
          '--- platform/game.ts',
          '+++ local/game.ts',
          '@@ -1,1 +1,1 @@',
          '-const a = `old`;',
          '+const a = `new`;',
        ],
      }),
    );
    expect(colorCheckoutLines(lines, false)).toEqual(lines);
    expect(colorCheckoutLines(lines, true)).toContain('\u001b[31m-const a = `old`;\u001b[0m');
    expect(colorCheckoutLines(lines, true)).toContain('\u001b[32m+const a = `new`;\u001b[0m');
    expect(checkoutLineStyle('@@ -1,1 +1,1 @@')?.tone).toBe('cyan');
  });

  it('strips terminal controls from paths, versions and diff content before adding trusted colors', () => {
    const hostile = 'bad\u001b[2J\u009b31m\r.ts';
    const output = formatCheckoutStatus(
      report({ kind: 'local_only', version: hostile, local: [hostile] }),
      hostile,
    ).join('\n');
    for (const control of ['\u001b', '\u009b', '\r']) expect(output).not.toContain(control);
    expect(formatCheckoutDiff(report({ patches: ['+hello\u001b]0;title\u0007'] })).join('\n')).not.toContain('\u001b');
  });
});
