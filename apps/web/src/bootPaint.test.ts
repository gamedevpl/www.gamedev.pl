import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const indexHtml = readFileSync(path.join(path.dirname(fileURLToPath(import.meta.url)), '../index.html'), 'utf8');

describe('index.html boot paint', () => {
  it('paints the dark shell before the hashed CSS/JS arrive', () => {
    // iOS Home Screen dismisses its splash onto whatever the document paints next.
    // An empty #root with no inline background is the browser default white.
    expect(indexHtml).toMatch(/background:\s*#0f1418/);
    expect(indexHtml).toMatch(/color-scheme:\s*dark/);
    expect(indexHtml).toMatch(/class="boot"/);
    expect(indexHtml).toMatch(/gamedev<span>\.pl<\/span>/);
  });

  it('keeps a classic-script reload path when the module graph never boots', () => {
    expect(indexHtml).toMatch(/boot-recover-btn/);
    expect(indexHtml).toMatch(/__gamedevBooted/);
    expect(indexHtml).toMatch(/location\.reload\(\)/);
  });
});
