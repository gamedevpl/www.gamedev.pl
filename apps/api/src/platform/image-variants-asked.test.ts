import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { isVariantWidth, VARIANT_WIDTHS } from './image-variants.js';

const WEB_SRC = new URL('../../../web/src', import.meta.url).pathname;
const LARGEST_BAKED = Math.max(...VARIANT_WIDTHS);

function sourceFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) return sourceFiles(path);
    if (!/\.tsx?$/.test(entry.name) || entry.name.includes('.test.')) return [];
    return [path];
  });
}

function askedWidths(): Array<{ width: number; file: string }> {
  const asks: Array<{ width: number; file: string }> = [];
  for (const file of sourceFiles(WEB_SRC)) {
    const source = readFileSync(file, 'utf8');
    for (const match of source.matchAll(/catalogMediaUrl\([^)]*?,\s*(\d+)\s*\)/g)) {
      asks.push({ width: Number(match[1]), file: file.slice(WEB_SRC.length + 1) });
    }
  }
  return asks;
}

describe('the widths the catalog asks for', () => {
  it('finds the call sites at all, so an empty pass cannot look green', () => {
    expect(askedWidths().length).toBeGreaterThan(4);
  });

  it('answer the widths the grid uses, and refuse the ones above our sources', () => {
    expect(isVariantWidth(160)).toBe(true);
    expect(isVariantWidth(320)).toBe(true);
    expect(isVariantWidth(1280)).toBe(false);
  });

  it('are baked, or are larger than any screenshot we hold', () => {
    for (const { width, file } of askedWidths()) {
      const baked = (VARIANT_WIDTHS as readonly number[]).includes(width);
      // Above the largest baked width there is nothing to downscale.
      const abovePoint = width > LARGEST_BAKED;
      expect(
        baked || abovePoint,
        `${file} asks for w=${width}, which is neither baked (${VARIANT_WIDTHS.join(', ')}) ` +
          `nor above the largest baked width. It will silently serve the full-size original.`,
      ).toBe(true);
    }
  });
});
