// What a proposal actually changes.
//
// The reviewer's card leads with the playable preview and the gate verdict, because those
// are what a non-technical creator can judge. This is the second click: the file list and
// the lines, for a reviewer who wants to look.
//
// Two properties matter more than the diff algorithm:
//
//   **It is bounded.** A proposal can be up to the delivery cap, and rendering an
//   unbounded diff into a review card is a way to make one stranger's upload freeze
//   somebody's Studio. Files, hunks and lines are all capped, and what was dropped is
//   reported rather than silently omitted.
//
//   **It is inert.** Every line that comes out of here is text, and the client renders it
//   as text. This is the first surface on the site where a stranger's *code* is put in
//   front of a human, and the only safe posture is that nothing in it is ever interpreted
//   — not as markup, not as a link, not as an instruction.
//
// The algorithm itself is a plain LCS over lines. Not because it is the best diff — it is
// not — but because it is the one whose output a reader can predict, and a review diff
// that occasionally rearranges hunks cleverly is worse than one that never surprises.

import type { SourceFile } from '../delivery/games-store.js';

export type DiffLine = { kind: 'context' | 'add' | 'del'; text: string; a?: number; b?: number };

export interface FileDiff {
  path: string;
  status: 'added' | 'removed' | 'modified';
  additions: number;
  deletions: number;
  lines: DiffLine[];
  /** Set when this file's diff was cut short by the line cap. */
  truncated?: boolean;
}

export interface ProposalDiff {
  files: FileDiff[];
  additions: number;
  deletions: number;
  /** Files changed but omitted from `files` because of the file cap. */
  omittedFiles: number;
}

/** Caps. Generous for a real game, small enough that a hostile upload renders in a blink. */
export const MAX_DIFF_FILES = 40;
export const MAX_DIFF_LINES_PER_FILE = 400;
/** Context lines kept either side of a change. Three is the universal convention. */
const CONTEXT = 3;

function splitLines(content: string): string[] {
  // A trailing newline would otherwise produce a phantom empty last line that reads as a
  // change whenever one side has it and the other does not.
  const lines = content.split('\n');
  if (lines.length > 0 && lines[lines.length - 1] === '') lines.pop();
  return lines;
}

/**
 * Longest common subsequence over lines, as a backtrace of operations.
 *
 * Quadratic in the file's line count, which is fine at these sizes and is bounded anyway:
 * a game module is hundreds of lines, and the byte budget caps the whole delivery at 2 MB.
 * A file long enough for this to matter is a file the caps already truncate.
 */
function diffLines(before: string[], after: string[]): DiffLine[] {
  const n = before.length;
  const m = after.length;
  const table: number[][] = Array.from({ length: n + 1 }, () => new Array<number>(m + 1).fill(0));
  for (let i = n - 1; i >= 0; i -= 1) {
    for (let j = m - 1; j >= 0; j -= 1) {
      table[i][j] = before[i] === after[j] ? table[i + 1][j + 1] + 1 : Math.max(table[i + 1][j], table[i][j + 1]);
    }
  }

  const out: DiffLine[] = [];
  let i = 0;
  let j = 0;
  while (i < n && j < m) {
    if (before[i] === after[j]) {
      out.push({ kind: 'context', text: before[i], a: i + 1, b: j + 1 });
      i += 1;
      j += 1;
    } else if (table[i + 1][j] >= table[i][j + 1]) {
      out.push({ kind: 'del', text: before[i], a: i + 1 });
      i += 1;
    } else {
      out.push({ kind: 'add', text: after[j], b: j + 1 });
      j += 1;
    }
  }
  while (i < n) {
    out.push({ kind: 'del', text: before[i], a: i + 1 });
    i += 1;
  }
  while (j < m) {
    out.push({ kind: 'add', text: after[j], b: j + 1 });
    j += 1;
  }
  return out;
}

/**
 * Drop runs of context far from any change.
 *
 * Without this a one-line change to a 600-line module renders 600 lines, 597 of which say
 * nothing — and the reviewer scrolls past the thing they were asked to look at.
 */
function trimContext(lines: DiffLine[]): DiffLine[] {
  const keep = new Array<boolean>(lines.length).fill(false);
  for (let index = 0; index < lines.length; index += 1) {
    if (lines[index].kind === 'context') continue;
    for (let near = Math.max(0, index - CONTEXT); near <= Math.min(lines.length - 1, index + CONTEXT); near += 1) {
      keep[near] = true;
    }
  }
  return lines.filter((_, index) => keep[index]);
}

/** One file's diff, or null when the two sides are identical. */
export function diffFile(path: string, before: string | null, after: string | null): FileDiff | null {
  if (before === after) return null;
  const beforeLines = before === null ? [] : splitLines(before);
  const afterLines = after === null ? [] : splitLines(after);

  const operations = diffLines(beforeLines, afterLines);
  // No add or del means the two sides differ only in trailing whitespace the line split
  // already normalized away. Reporting that as a change would mark every file modified
  // the moment one side was written with a trailing newline and the other was not.
  if (!operations.some((line) => line.kind !== 'context')) return null;

  const all = trimContext(operations);
  const truncated = all.length > MAX_DIFF_LINES_PER_FILE;
  const lines = truncated ? all.slice(0, MAX_DIFF_LINES_PER_FILE) : all;

  return {
    path,
    status: before === null ? 'added' : after === null ? 'removed' : 'modified',
    // Counted over the whole diff, not the truncated view: a reviewer deciding whether to
    // read further needs the real size, not the size of what fitted.
    additions: all.filter((line) => line.kind === 'add').length,
    deletions: all.filter((line) => line.kind === 'del').length,
    lines,
    ...(truncated ? { truncated: true } : {}),
  };
}

/**
 * Diff a proposal's file set against the base it was built on.
 *
 * Both sides arrive as complete source sets — the proposal stores whole versions rather
 * than patches, because the gate builds a version and "what ran" and "what the reviewer
 * reads" have to be the same thing. Computing the diff here rather than storing one keeps
 * that true: there is no second representation to drift.
 */
export function diffProposal(base: SourceFile[], proposed: SourceFile[]): ProposalDiff {
  const beforeByPath = new Map(base.map((file) => [file.path, file.content]));
  const afterByPath = new Map(proposed.map((file) => [file.path, file.content]));
  const paths = [...new Set([...beforeByPath.keys(), ...afterByPath.keys()])].sort();

  const changed: FileDiff[] = [];
  for (const path of paths) {
    const diff = diffFile(path, beforeByPath.get(path) ?? null, afterByPath.get(path) ?? null);
    if (diff) changed.push(diff);
  }

  const files = changed.slice(0, MAX_DIFF_FILES);
  return {
    files,
    additions: changed.reduce((sum, file) => sum + file.additions, 0),
    deletions: changed.reduce((sum, file) => sum + file.deletions, 0),
    // Reported rather than hidden: a review that silently showed 40 of 60 changed files
    // would read as complete, and a reviewer would approve what they never saw.
    omittedFiles: Math.max(0, changed.length - files.length),
  };
}
