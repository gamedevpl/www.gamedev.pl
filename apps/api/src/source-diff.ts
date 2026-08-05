/**
 * Line counts between two versions of a game's sources — the review tab's footnote.
 *
 * Deliberately a summary and not a diff view. The whole point of the review surface is
 * that a change to a game is judged by playing it, not by reading it; the numbers exist
 * so "how big is this" has an answer, and they are the last thing on the page rather
 * than the first. Nothing here reconstructs a patch, and nothing renders source.
 */

/**
 * Files longer than this report as changed without counts.
 *
 * The LCS table below is O(n×m) in memory, which is fine for the few-hundred-line files
 * a game is made of and is not fine for a generated asset blob that happens to live in
 * `source/`. Past the cap the honest answer is "changed", not a number that cost a
 * hundred megabytes to compute.
 */
export const DIFF_LINE_CAP = 4_000;

export interface FileDiffStat {
  path: string;
  status: 'added' | 'removed' | 'modified';
  /** Null when the file was too large to count — see {@link DIFF_LINE_CAP}. */
  added: number | null;
  removed: number | null;
}

export interface SourceDiffSummary {
  files: FileDiffStat[];
  filesChanged: number;
  added: number;
  removed: number;
  /** True when at least one file was past the cap, so the totals are a floor. */
  truncated: boolean;
}

/** Added/removed line counts for one file, via a plain LCS over lines. */
export function diffLines(before: string, after: string): { added: number; removed: number } | null {
  const a = splitLines(before);
  const b = splitLines(after);
  if (a.length > DIFF_LINE_CAP || b.length > DIFF_LINE_CAP) return null;

  // Rolling two-row LCS: the length is all that is needed, never the path itself, so
  // the full table would be memory spent on an answer nobody reads.
  let previous = new Array<number>(b.length + 1).fill(0);
  let current = new Array<number>(b.length + 1).fill(0);
  for (let i = 1; i <= a.length; i += 1) {
    for (let j = 1; j <= b.length; j += 1) {
      current[j] = a[i - 1] === b[j - 1] ? previous[j - 1] + 1 : Math.max(previous[j], current[j - 1]);
    }
    [previous, current] = [current, previous];
    current.fill(0);
  }
  const common = previous[b.length];
  return { removed: a.length - common, added: b.length - common };
}

function splitLines(text: string): string[] {
  if (text === '') return [];
  return text.replace(/\r\n/g, '\n').split('\n');
}

/**
 * Compares two source trees, keyed by path. A file present on one side only is an
 * add or a remove; the rest are compared line by line, and identical files are dropped.
 */
export function summarizeSourceDiff(before: Map<string, string>, after: Map<string, string>): SourceDiffSummary {
  const paths = [...new Set([...before.keys(), ...after.keys()])].sort();
  const files: FileDiffStat[] = [];
  let added = 0;
  let removed = 0;
  let truncated = false;

  for (const path of paths) {
    const left = before.get(path);
    const right = after.get(path);
    if (left === undefined && right !== undefined) {
      const counts = diffLines('', right);
      truncated ||= counts === null;
      added += counts?.added ?? 0;
      files.push({ path, status: 'added', added: counts?.added ?? null, removed: counts ? 0 : null });
      continue;
    }
    if (left !== undefined && right === undefined) {
      const counts = diffLines(left, '');
      truncated ||= counts === null;
      removed += counts?.removed ?? 0;
      files.push({ path, status: 'removed', added: counts ? 0 : null, removed: counts?.removed ?? null });
      continue;
    }
    if (left === right) continue;
    const counts = diffLines(left ?? '', right ?? '');
    truncated ||= counts === null;
    added += counts?.added ?? 0;
    removed += counts?.removed ?? 0;
    files.push({ path, status: 'modified', added: counts?.added ?? null, removed: counts?.removed ?? null });
  }

  return { files, filesChanged: files.length, added, removed, truncated };
}
