import type { DiffReport } from './checkout.js';
import { sanitizePath, stripTerminalControls } from './ansi.js';
import { formatIgnoredNotice } from './working-copy.js';
import { missingBaseRecovery } from './checkout-sync.js';

function fileLabels(patches: string[]): Map<string, string> {
  const labels = new Map<string, string>();
  for (let i = 0; i < patches.length - 1; i++) {
    if (i > 0 && patches[i - 1] !== '') continue;
    const before = patches[i];
    const after = patches[i + 1];
    if (!before?.startsWith('--- ') || !after?.startsWith('+++ ')) continue;
    const path = after.startsWith('+++ local/') ? after.slice(10) : before.slice(13);
    labels.set(path, before === '--- /dev/null' ? 'new file' : after === '+++ /dev/null' ? 'deleted' : 'modified');
  }
  return labels;
}

function notices(report: DiffReport): string[] {
  const lines: string[] = [];
  if (report.kind === 'legacy') {
    lines.push('Checkout has no base version; local and platform changes cannot be separated safely.');
    lines.push(missingBaseRecovery());
  }
  if (report.incoming.blocked.length) {
    lines.push('', 'Ignored paths blocking pull:');
    lines.push(...report.incoming.blocked.map((path) => `  blocked: ${sanitizePath(path)}`));
    lines.push('Move these files aside before pulling.');
  }
  const ignored = formatIgnoredNotice(report.ignored);
  if (ignored.length) lines.push('', 'Ignored files (not delivered):', ...ignored);
  return lines;
}

export function formatCheckoutStatus(report: DiffReport, slug: string): string[] {
  const lines = [
    `Working copy: ${sanitizePath(slug)}`,
    `Platform version: ${sanitizePath(report.version) || '(none)'}`,
  ];
  if (report.operation)
    lines.push(
      '',
      `Pending ${report.operation.kind} merge:`,
      ...report.operation.conflicts.map(
        (c) => `  ${c.resolved ? 'resolved' : c.kind}: ${c.paths.map(sanitizePath).join(', ')}`,
      ),
      `  gamedevpl resolve — then ${report.operation.next}`,
    );
  const labels = fileLabels(report.patches);
  if (report.local.length) {
    lines.push(
      '',
      report.kind === 'legacy' ? 'Differences from platform (base version missing):' : 'Local changes (not delivered):',
      report.kind === 'legacy'
        ? '  (use "gamedevpl diff" to inspect)'
        : '  (use "gamedevpl diff" to inspect, "gamedevpl push" to deliver)',
    );
    lines.push(
      ...report.local.map((path) => `  ${labels.get(sanitizePath(path)) ?? 'modified'}: ${sanitizePath(path)}`),
    );
  }
  if (report.platform.length) {
    lines.push('', 'Changes on platform:', '  (use "gamedevpl pull" to bring these changes into your checkout)');
    lines.push(
      ...report.platform.map((path) => {
        const label = labels.get(sanitizePath(path));
        return `  incoming: ${label === 'new file' ? 'deleted' : label === 'deleted' ? 'new file' : 'modified'}: ${sanitizePath(path)}`;
      }),
    );
  }
  if (report.conflict.length) {
    lines.push('', 'Conflicts (local and platform changed):', '  (use "gamedevpl diff" to compare before resolving)');
    lines.push(...report.conflict.map((path) => `  both changed: ${sanitizePath(path)}`));
  }
  if (report.kind === 'clean' && !report.incoming.blocked.length && !report.operation)
    lines.push('', 'Working tree clean — local files match the platform.');
  lines.push(...notices(report));
  return lines;
}

export function formatCheckoutDiff(report: DiffReport): string[] {
  const lines = report.patches.length
    ? ['Diff: platform → local', '', ...report.patches.map(stripTerminalControls)]
    : ['Working tree clean — no differences against the platform.'];
  lines.push(...notices(report));
  return lines;
}
