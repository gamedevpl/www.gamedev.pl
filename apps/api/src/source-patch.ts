/**
 * Exact string patches for game source staging (MCP / agent channel).
 *
 * Chat-thin agents (Claude Chat especially) otherwise re-emit entire `render.ts` /
 * `model.ts` files on every tweak via `stage_source_file`. A unique old→new replace
 * keeps the tool payload proportional to the edit.
 */

export class SourcePatchError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SourcePatchError';
  }
}

export type ApplySourcePatchInput = {
  content: string;
  oldString: string;
  newString: string;
  /** When true, replace every occurrence; otherwise `oldString` must match exactly once. */
  replaceAll?: boolean;
};

export type ApplySourcePatchResult = {
  content: string;
  replacements: number;
};

/**
 * Apply an exact string replacement. Fail closed on empty oldString, no match, or
 * (unless replaceAll) an ambiguous multi-match.
 */
export function applySourcePatch(input: ApplySourcePatchInput): ApplySourcePatchResult {
  const { content, oldString, newString, replaceAll = false } = input;
  if (oldString.length === 0) {
    throw new SourcePatchError('oldString must not be empty');
  }
  if (oldString === newString) {
    throw new SourcePatchError('oldString and newString are identical — nothing to change');
  }

  if (replaceAll) {
    if (!content.includes(oldString)) {
      throw new SourcePatchError('oldString not found in file — read the current sources and retry with exact text');
    }
    let replacements = 0;
    let next = content;
    let index = next.indexOf(oldString);
    while (index !== -1) {
      next = next.slice(0, index) + newString + next.slice(index + oldString.length);
      replacements += 1;
      index = next.indexOf(oldString, index + newString.length);
    }
    return { content: next, replacements };
  }

  const first = content.indexOf(oldString);
  if (first === -1) {
    throw new SourcePatchError('oldString not found in file — read the current sources and retry with exact text');
  }
  const second = content.indexOf(oldString, first + oldString.length);
  if (second !== -1) {
    throw new SourcePatchError(
      'oldString matched more than once — pass a longer unique snippet, or set replaceAll=true',
    );
  }
  return {
    content: content.slice(0, first) + newString + content.slice(first + oldString.length),
    replacements: 1,
  };
}

/** Soft size hint: full-file rewrites past this burn connector tokens on chat-thin clients. */
export const LARGE_SOURCE_FILE_HINT_BYTES = 24 * 1024;

export function largeSourceFileHint(path: string, bytes: number): string | null {
  if (bytes < LARGE_SOURCE_FILE_HINT_BYTES) return null;
  return (
    `${path} is ${bytes} bytes. Prefer cohesive modules under ~${LARGE_SOURCE_FILE_HINT_BYTES} bytes ` +
    `(split render/HUD/art or model tables) and use patch_source_file for later edits so you do not ` +
    `re-emit the whole file.`
  );
}
