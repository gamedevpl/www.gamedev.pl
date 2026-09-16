import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const css = readFileSync(join(dirname(fileURLToPath(import.meta.url)), 'editor-kit.css'), 'utf8');

describe('editor banners must not shift the board', () => {
  it('takes the banner slot out of normal flow', () => {
    expect(css).toMatch(/\.editor-banner-slot\s*\{[^}]*position:\s*absolute/s);
  });
});
