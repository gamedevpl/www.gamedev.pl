import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { generateIndexHtml } from '../catalog/index-html-generator.js';

// Lockstep twin: games-repo index-html.ts

// Drift here is silent: creator approves one body, players get another.

// Regenerate both goldens when output changes

const fixturesDir = path.join(path.dirname(fileURLToPath(import.meta.url)), 'fixtures');

describe('index.html generator cross-repo contract', () => {
  it('reproduces the shared golden byte-for-byte', () => {
    const fixture = JSON.parse(readFileSync(path.join(fixturesDir, 'index-html-contract.json'), 'utf8')) as {
      spec: { title: string };
      manifest: Record<string, unknown>;
    };
    const golden = readFileSync(path.join(fixturesDir, 'index-html-contract.expected.html'), 'utf8');

    expect(generateIndexHtml(fixture.manifest, fixture.spec)).toBe(golden);
  });
});
