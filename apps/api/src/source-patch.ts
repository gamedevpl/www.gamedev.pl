// Unified-diff patches for game source staging (MCP / agent channel).

import { applyPatch, parsePatch } from 'diff';

export class SourcePatchError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SourcePatchError';
  }
}

export type ApplySourcePatchInput = {
  content: string;
  path: string;
  patch: string;
};

export type ApplyExactReplaceInput = {
  content: string;
  path: string;
  old: string;
  new: string;
};

export type ExactReplacePair = {
  old: string;
  new: string;
};

export type ApplyMultipleExactReplacesInput = {
  content: string;
  path: string;
  patches: ExactReplacePair[];
};

export type ApplySourcePatchResult = {
  content: string;
  /** Number of hunks / replacements applied. */
  replacements: number;
};

/** Strip common git/diff path prefixes so `a/game.ts` and `game.ts` compare equal. */
export function normalizePatchPath(raw: string): string {
  let path = raw.trim().replaceAll('\\', '/');
  if (path.startsWith('"') && path.endsWith('"')) {
    path = path.slice(1, -1);
  }
  // Timestamps after a tab (GNU diff / git): "game.ts\t2026-01-01 …"
  const tab = path.indexOf('\t');
  if (tab !== -1) path = path.slice(0, tab);
  if (path.startsWith('a/') || path.startsWith('b/')) path = path.slice(2);
  if (path.startsWith('./')) path = path.slice(2);
  return path;
}

/** Numbered hunk header, optionally with a trailing function-context label. */
const NUMBERED_HUNK_HEADER = /^@@\s+-(\d+)(?:,(\d+))?\s+\+(\d+)(?:,(\d+))?\s*@@(.*)$/;

/**
 * True for a line that starts a hunk: numbered `@@ -n,m +n,m @@` or bare `@@` /
 * `@@ label` (no line numbers — common from chat models).
 */
function isHunkHeaderLine(line: string): boolean {
  if (NUMBERED_HUNK_HEADER.test(line)) return true;
  // Bare `@@` or `@@ some context` without `-N +N`.
  return /^@@(?:\s.*)?$/.test(line) && !/^@@\s+-/.test(line);
}

function isHunkBoundary(line: string): boolean {
  if (isHunkHeaderLine(line)) return true;
  if (line.startsWith('diff ')) return true;
  if (/^Index:\s/.test(line)) return true;
  if (/^===/.test(line)) return true;
  // Next file in a multi-file patch — not a hunk body line.
  if (/^---\s+\S/.test(line) || /^\+\+\+\s+\S/.test(line)) return true;
  return false;
}

/** Ensure each hunk body line has a unified-diff operation prefix. */
function normalizeHunkBodyLine(line: string): string {
  if (line.length === 0) return ' ';
  const op = line[0]!;
  if (op === '+' || op === '-' || op === ' ' || op === '\\') return line;
  // Context line missing the leading space (LLM habit).
  return ` ${line}`;
}

function countHunkLines(body: string[]): { oldLines: number; newLines: number } {
  let oldLines = 0;
  let newLines = 0;
  for (const line of body) {
    const op = line[0] ?? ' ';
    if (op === '+') newLines++;
    else if (op === '-') oldLines++;
    else if (op === '\\') {
      /* "\ No newline at end of file" — not counted */
    } else {
      oldLines++;
      newLines++;
    }
  }
  return { oldLines, newLines };
}

/**
 * Rewrite agent-friendly near-unified diffs into something `diff` can parse:
 * bare `@@` → numbered headers (counts from body; starts default to 1 — apply matches
 * by context), wrong `,count` values → recounted, context lines missing a leading
 * space → prefixed.
 */
export function normalizeUnifiedDiff(patchText: string): string {
  // MCP / Windows clients often send CRLF. split('\n') would leave a trailing \r on
  // every line, so applyPatch's exact context match fails against LF game sources.
  // jsdiff itself tolerates CRLF patches; once we rewrite hunks we must too.
  const text = patchText.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
  const endsWithNewline = text.endsWith('\n');
  const lines = text.split('\n');
  // split keeps a trailing empty from a final newline; drop it so we don't treat it
  // as a stray body line, then re-attach the newline at the end.
  if (endsWithNewline && lines[lines.length - 1] === '') lines.pop();

  const out: string[] = [];
  let i = 0;
  while (i < lines.length) {
    const line = lines[i]!;
    if (!isHunkHeaderLine(line)) {
      out.push(line);
      i++;
      continue;
    }

    const numbered = NUMBERED_HUNK_HEADER.exec(line);
    const oldStart = numbered ? Number(numbered[1]) : 1;
    const newStart = numbered ? Number(numbered[3]) : 1;
    const label = numbered ? (numbered[5] ?? '').trimEnd() : '';
    i++;

    const body: string[] = [];
    while (i < lines.length && !isHunkBoundary(lines[i]!)) {
      body.push(normalizeHunkBodyLine(lines[i]!));
      i++;
    }
    // Trailing blank lines after the last real change are not part of the hunk.
    while (body.length > 0 && body[body.length - 1] === ' ') body.pop();

    const { oldLines, newLines } = countHunkLines(body);
    if (oldLines === 0 && newLines === 0) {
      throw new SourcePatchError('patch hunk is empty — each @@ hunk needs context and/or +/- lines under it');
    }

    const labelSuffix = label.length > 0 ? ` ${label.trimStart()}` : '';
    out.push(`@@ -${oldStart},${oldLines} +${newStart},${newLines} @@${labelSuffix}`);
    out.push(...body);
  }

  return endsWithNewline || text.length === 0 ? `${out.join('\n')}\n` : out.join('\n');
}

function assertPatchTargetsPath(path: string, patchText: string): number {
  let parsed;
  try {
    parsed = parsePatch(patchText);
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    throw new SourcePatchError(
      `patch is not a valid unified diff (${detail}). Prefer old+new exact replace, or pass ---/+++ + @@ hunks for one file`,
    );
  }
  if (parsed.length === 0) {
    throw new SourcePatchError('patch is empty — pass a unified diff with at least one @@ hunk');
  }
  if (parsed.length > 1) {
    throw new SourcePatchError(
      `patch touches ${parsed.length} files — patch_source_file accepts ONE path; call once per file`,
    );
  }
  const file = parsed[0]!;
  const names = [file.oldFileName, file.newFileName]
    .filter((name): name is string => typeof name === 'string' && name.length > 0)
    .map(normalizePatchPath)
    .filter((name) => name !== '/dev/null' && name !== 'dev/null');

  for (const name of names) {
    if (name !== path) {
      throw new SourcePatchError(
        `patch path ${name} does not match path ${path} — keep the diff headers on the same file`,
      );
    }
  }
  if (names.length === 0) {
    throw new SourcePatchError(
      `patch has no file path in ---/+++ headers — use --- a/${path} / +++ b/${path} (or bare ${path})`,
    );
  }

  const hunks = file.hunks?.length ?? 0;
  if (hunks === 0) {
    throw new SourcePatchError(
      'patch has no @@ hunks — nothing to apply. Use a unified diff with hunks like ' +
        '`@@ -10,6 +10,7 @@` (line numbers optional: bare `@@` is fine if context matches)',
    );
  }
  return hunks;
}

/**
 * Apply a unified diff to one file. Fail closed on parse errors, multi-file patches,
 * path mismatch, or context that does not match (no fuzzy apply).
 */
export function applySourcePatch(input: ApplySourcePatchInput): ApplySourcePatchResult {
  const path = input.path.trim();
  const rawPatch = input.patch.trim();
  if (!path) throw new SourcePatchError('path is required');
  if (!rawPatch) throw new SourcePatchError('patch must not be empty');

  let patch: string;
  try {
    patch = normalizeUnifiedDiff(rawPatch);
  } catch (error) {
    if (error instanceof SourcePatchError) throw error;
    throw new SourcePatchError(
      `patch could not be normalized — ${error instanceof Error ? error.message : String(error)}`,
    );
  }

  const hunks = assertPatchTargetsPath(path, patch);

  // fuzzFactor 0: context must match exactly. Stale hunks should re-get_sources and retry,
  // not silently land on the wrong lines of a large render.ts. Line numbers may be
  // approximate — applyPatch still locates hunks by matching context lines.
  const next = applyPatch(input.content, patch, { fuzzFactor: 0 });
  if (next === false) {
    throw new SourcePatchError(
      'patch did not apply cleanly — context lines no longer match. Re-read the file (get_sources) and regenerate the unified diff',
    );
  }
  if (next === input.content) {
    throw new SourcePatchError('patch applied but made no changes');
  }
  return { content: next, replacements: hunks };
}

/**
 * Exact unique substring replace — the chat-friendly alternative to unified diffs.
 * `old` must appear exactly once; widen the snippet with surrounding lines if not.
 */
export function applyExactReplace(input: ApplyExactReplaceInput): ApplySourcePatchResult {
  const path = input.path.trim();
  if (!path) throw new SourcePatchError('path is required');
  if (input.old.length === 0) {
    throw new SourcePatchError('old must not be empty — pass the exact text to replace');
  }
  if (input.old === input.new) {
    throw new SourcePatchError('old and new are identical — nothing to change');
  }

  // Advance by 1 so overlapping matches count (e.g. content "aaaa", old "aaa"
  // has matches at 0 and 1). Skipping by old.length would falsely treat that as unique.
  let occurrences = 0;
  let from = 0;
  while (true) {
    const at = input.content.indexOf(input.old, from);
    if (at === -1) break;
    occurrences++;
    from = at + 1;
    if (occurrences > 1) break;
  }

  if (occurrences === 0) {
    throw new SourcePatchError(
      `old text not found in ${path} — copy the exact snippet from the current file (get_sources / staged base)`,
    );
  }
  if (occurrences > 1) {
    throw new SourcePatchError(
      `old text matches more than once in ${path} — include more surrounding lines so it is unique`,
    );
  }

  const content = input.content.replace(input.old, input.new);
  return { content, replacements: 1 };
}

export function applyMultipleExactReplaces(input: ApplyMultipleExactReplacesInput): ApplySourcePatchResult {
  const path = input.path.trim();
  if (!path) throw new SourcePatchError('path is required');
  if (!Array.isArray(input.patches) || input.patches.length === 0) {
    throw new SourcePatchError('patches array must contain at least one replacement');
  }

  let currentContent = input.content;
  let totalReplacements = 0;

  for (let i = 0; i < input.patches.length; i++) {
    const p = input.patches[i]!;
    if (typeof p.old !== 'string' || typeof p.new !== 'string') {
      throw new SourcePatchError(`patch #${i + 1} must include old and new string properties`);
    }
    const res = applyExactReplace({
      content: currentContent,
      path,
      old: p.old,
      new: p.new,
    });
    currentContent = res.content;
    totalReplacements += res.replacements;
  }

  return { content: currentContent, replacements: totalReplacements };
}

/** @deprecated Prefer {@link largeSourceFileHint} from `module-size.js`. Re-exported for callers. */
export { largeSourceFileHint, MODULE_SOFT_LIMIT_BYTES as LARGE_SOURCE_FILE_HINT_BYTES } from './module-size.js';
