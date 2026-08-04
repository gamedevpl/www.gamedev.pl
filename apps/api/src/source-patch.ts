/**
 * Unified-diff patches for game source staging (MCP / agent channel).
 *
 * Chat-thin agents (Claude Chat especially) otherwise re-emit entire `render.ts` /
 * `model.ts` files on every tweak via `stage_source_file`. A unified diff keeps the
 * tool payload proportional to the edit — the format models already know well.
 */

import { applyPatch, parsePatch } from 'diff';

export class SourcePatchError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SourcePatchError';
  }
}

export type ApplySourcePatchInput = {
  content: string;
  /** Target game-relative path (e.g. game/render.ts). Must match the patch headers. */
  path: string;
  /** Unified diff for this one path (`---/`+++` + `@@` hunks). */
  patch: string;
};

export type ApplySourcePatchResult = {
  content: string;
  /** Number of hunks applied. */
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

function assertPatchTargetsPath(path: string, patchText: string): number {
  let parsed;
  try {
    parsed = parsePatch(patchText);
  } catch {
    throw new SourcePatchError('patch is not a valid unified diff — pass ---/+++ headers and @@ hunks for one file');
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
    throw new SourcePatchError('patch has no @@ hunks — nothing to apply');
  }
  return hunks;
}

/**
 * Apply a unified diff to one file. Fail closed on parse errors, multi-file patches,
 * path mismatch, or context that does not match (no fuzzy apply).
 */
export function applySourcePatch(input: ApplySourcePatchInput): ApplySourcePatchResult {
  const path = input.path.trim();
  const patch = input.patch.trim();
  if (!path) throw new SourcePatchError('path is required');
  if (!patch) throw new SourcePatchError('patch must not be empty');

  const hunks = assertPatchTargetsPath(path, patch);

  // fuzzFactor 0: context must match exactly. Stale hunks should re-get_sources and retry,
  // not silently land on the wrong lines of a large render.ts.
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

/** Soft size hint: full-file rewrites past this burn connector tokens on chat-thin clients. */
export const LARGE_SOURCE_FILE_HINT_BYTES = 24 * 1024;

export function largeSourceFileHint(path: string, bytes: number): string | null {
  if (bytes < LARGE_SOURCE_FILE_HINT_BYTES) return null;
  return (
    `${path} is ${bytes} bytes. Prefer cohesive modules under ~${LARGE_SOURCE_FILE_HINT_BYTES} bytes ` +
    `(split render/HUD/art or model tables) and use patch_source_file with a unified diff for later ` +
    `edits so you do not re-emit the whole file.`
  );
}
