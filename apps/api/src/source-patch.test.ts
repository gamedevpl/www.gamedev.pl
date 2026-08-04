import { describe, expect, it } from 'vitest';
import {
  applySourcePatch,
  LARGE_SOURCE_FILE_HINT_BYTES,
  largeSourceFileHint,
  SourcePatchError,
} from './source-patch.js';

describe('applySourcePatch', () => {
  it('replaces a unique snippet once', () => {
    const result = applySourcePatch({
      content: 'aaa\nTARGET\nbbb\n',
      oldString: 'TARGET',
      newString: 'REPLACED',
    });
    expect(result).toEqual({ content: 'aaa\nREPLACED\nbbb\n', replacements: 1 });
  });

  it('refuses an empty oldString', () => {
    expect(() => applySourcePatch({ content: 'x', oldString: '', newString: 'y' })).toThrow(SourcePatchError);
  });

  it('refuses a no-op identical replace', () => {
    expect(() => applySourcePatch({ content: 'same', oldString: 'same', newString: 'same' })).toThrow(/identical/);
  });

  it('refuses a missing oldString', () => {
    expect(() => applySourcePatch({ content: 'hello', oldString: 'missing', newString: 'x' })).toThrow(/not found/);
  });

  it('refuses an ambiguous match unless replaceAll', () => {
    expect(() => applySourcePatch({ content: 'aa aa', oldString: 'aa', newString: 'bb' })).toThrow(/more than once/);

    const all = applySourcePatch({
      content: 'aa aa',
      oldString: 'aa',
      newString: 'bb',
      replaceAll: true,
    });
    expect(all).toEqual({ content: 'bb bb', replacements: 2 });
  });
});

describe('largeSourceFileHint', () => {
  it('stays quiet under the soft ceiling', () => {
    expect(largeSourceFileHint('game/render.ts', LARGE_SOURCE_FILE_HINT_BYTES - 1)).toBeNull();
  });

  it('nudges toward split + patch past the ceiling', () => {
    const hint = largeSourceFileHint('game/render.ts', LARGE_SOURCE_FILE_HINT_BYTES);
    expect(hint).toMatch(/game\/render\.ts/);
    expect(hint).toMatch(/patch_source_file/);
    expect(hint).toMatch(/split/i);
  });
});
