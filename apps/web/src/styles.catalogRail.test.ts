import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const styles = readFileSync(new URL('./styles.css', import.meta.url), 'utf8');

describe('catalog rail capability layout', () => {
  it('keeps mobile capability badges stacked before the preview toggle', () => {
    const mobile = /@media \(pointer: coarse\), \(max-width: 768px\) \{([\s\S]*?)\n\}\n\n\.rail-card-body/.exec(styles)?.[1] ?? '';

    expect(mobile).not.toBe('');
    expect(mobile).toMatch(
      /\.rail-card-capabilities \{[\s\S]*right: 44px;[\s\S]*max-width: calc\(100% - 52px\);[\s\S]*flex-direction: column;/,
    );
    expect(mobile).toMatch(
      /\.rail-card-preview-toggle \{[\s\S]*bottom: 8px;[\s\S]*right: 8px;[\s\S]*width: 28px;/,
    );
  });
});
