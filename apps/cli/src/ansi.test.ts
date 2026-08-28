import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { formatAdapterEvent, sanitizeEventPayload } from './ansi.js';

const here = dirname(fileURLToPath(import.meta.url));

describe('sanitizeEventPayload', () => {
  it('strips CSI, OSC, and forged platform lines into one prefixed inert line', () => {
    const fixture = readFileSync(join(here, 'fixtures', 'hostile-delegate.ndjson'), 'utf8');
    const lines = fixture
      .trim()
      .split('\n')
      .map((row) => JSON.parse(row) as { text: string });
    const rendered = lines.map((row) => formatAdapterEvent('claude', row.text));
    for (const line of rendered) {
      expect(line.startsWith('claude ▸ ')).toBe(true);
      expect(line.includes(String.fromCharCode(27))).toBe(false);
      expect(line).not.toMatch(/\n/);
      expect(line.split('\n')).toHaveLength(1);
    }
    expect(rendered.some((line) => line.includes('preview green'))).toBe(true);
    expect(rendered.every((line) => line.startsWith('claude ▸ '))).toBe(true);
    expect(rendered.join('\n')).not.toMatch(/^✓ preview green$/m);
  });

  it('bounds length and collapses whitespace', () => {
    expect(sanitizeEventPayload(`a\n\nb${'x'.repeat(400)}`)).toHaveLength(240);
  });
});
