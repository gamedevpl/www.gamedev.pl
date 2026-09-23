import { cliUsage } from './bin-name.js';
import { formatSyncLines, type SyncResult, type TreeFile } from './checkout-sync.js';
import type { IgnoredHit } from './ignore.js';
import { sanitizePath } from './ansi.js';
import { unifiedDiff } from './text-diff.js';

const LIST_LIMIT = 12;

export function formatPathList(paths: string[]): string {
  const clean = paths.map(sanitizePath);
  const shown = clean.slice(0, LIST_LIMIT);
  const more = clean.length > LIST_LIMIT ? `, and ${clean.length - LIST_LIMIT} more` : '';
  return `${shown.join(', ')}${more}`;
}

function ignoredLabel(hit: IgnoredHit): string {
  const clean = sanitizePath(hit.path);
  return hit.directory ? `${clean}/` : clean;
}

export function formatIgnoredNotice(ignored: IgnoredHit[]): string[] {
  if (!ignored.length) return [];
  const lines: string[] = [];
  if (ignored.some((hit) => hit.source === 'git')) lines.push('.git is never uploaded.');
  const groups: Array<[string, IgnoredHit[]]> = [
    ['.gitignore', ignored.filter((hit) => hit.source === 'gitignore')],
    ['.gamedevplignore', ignored.filter((hit) => hit.source === 'gamedevplignore')],
  ];
  for (const [name, hits] of groups) {
    if (!hits.length) continue;
    lines.push(`ignored by ${name}, not delivered: ${formatPathList(hits.map(ignoredLabel))}`);
  }
  return lines;
}

export function formatPatches(sync: SyncResult, local: TreeFile[], remote: TreeFile[]): string[] {
  const names = [...new Set([...sync.local, ...sync.platform, ...sync.conflict])].sort();
  const platform = new Map(remote.map((file) => [file.path, file.content]));
  const here = new Map(local.map((file) => [file.path, file.content]));
  const lines: string[] = [];
  for (const path of names) {
    const patch = unifiedDiff(
      path,
      platform.has(path) ? platform.get(path)! : null,
      here.has(path) ? here.get(path)! : null,
    );
    if (!patch.length) continue;
    if (lines.length) lines.push('');
    lines.push(...patch);
  }
  return lines;
}

export function formatWorkingCopy(input: {
  sync: SyncResult;
  ignored: IgnoredHit[];
  patches?: string[];
  clash?: string[];
}): string[] {
  const lines = [...formatSyncLines(input.sync)];
  if (input.patches?.length) {
    lines.push('');
    lines.push(...input.patches);
  }
  const notice = formatIgnoredNotice(input.ignored);
  if (notice.length) {
    lines.push('');
    lines.push(...notice);
  }
  if (input.clash?.length) {
    lines.push(
      `ignored files differ from the platform (${formatPathList(input.clash)}) — pull refuses until they are moved aside`,
    );
  }
  return lines;
}

export function formatDiffReport(
  report: SyncResult & { ignored: IgnoredHit[]; patches: string[]; incoming: { blocked: string[] } },
): string[] {
  return formatWorkingCopy({
    sync: report,
    ignored: report.ignored,
    patches: report.patches,
    clash: report.incoming.blocked,
  });
}

export function ignoredClashMessage(paths: string[]): string {
  return `pull would overwrite ignored local files (${formatPathList(paths)}) — they stay out of push, but they differ from the platform. Move them aside, or ${cliUsage('pull', '--force')} replaces them with the platform copy.`;
}

export function formatCheckoutIncoming(incoming: { blocked: string[]; absent: string[]; git: string[] }): string[] {
  const lines: string[] = [];
  const landed = [...incoming.blocked, ...incoming.absent].sort();
  if (landed.length) lines.push(`platform files landed on ignored paths: ${formatPathList(landed)}`);
  if (incoming.git.length) lines.push(`.git is never written: ${formatPathList(incoming.git)}`);
  return lines;
}

export function formatPullNotices(
  incoming: { blocked: string[]; absent: string[]; git: string[] },
  force: boolean,
): string[] {
  const lines: string[] = [];
  if (force && incoming.blocked.length) {
    lines.push(`replaced ignored local files: ${formatPathList(incoming.blocked)}`);
  }
  if (incoming.absent.length) {
    lines.push(
      force
        ? `wrote ignored platform files: ${formatPathList(incoming.absent)}`
        : `left ignored platform files unwritten: ${formatPathList(incoming.absent)}`,
    );
  }
  if (incoming.git.length) lines.push(`.git is never written: ${formatPathList(incoming.git)}`);
  return lines;
}
