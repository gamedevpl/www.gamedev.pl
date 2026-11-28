import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const css = readFileSync(fileURLToPath(new URL('./styles.css', import.meta.url)), 'utf8').replace(
  /\/\*[\s\S]*?\*\//g,
  '',
);

describe('theater rotate lock pill styling', () => {
  it('makes the lockable rotate pill tappable and clear of the fullscreen exit', () => {
    expect(css).toMatch(/\.theater-rotate-hint\.is-action\s*\{[^}]*pointer-events:\s*auto/);
    expect(css).toMatch(/\.is-native-fullscreen \.theater-rotate-hint\s*\{[^}]*left:\s*68px/);
  });
});
