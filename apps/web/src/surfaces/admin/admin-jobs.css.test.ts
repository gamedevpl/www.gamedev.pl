import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const css = readFileSync(fileURLToPath(new URL('./styles.css', import.meta.url)), 'utf8').replace(
  /\/\*[\s\S]*?\*\//g,
  '',
);

function rule(selector: string): string {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const pattern = new RegExp(`(?:^|[},])\\s*${escaped}\\s*(?:,[^{}]*)?\\{`, 'm');
  const match = pattern.exec(css);
  expect(match, `no ${selector} rule in styles.css`).not.toBeNull();
  const start = match!.index + match![0].length;
  const end = css.indexOf('}', start);
  expect(end, `${selector} rule is never closed`).toBeGreaterThan(start);
  return css.slice(start, end);
}

function zIndexOf(selector: string): number {
  const match = /z-index:\s*(\d+)/.exec(rule(selector));
  expect(match, `${selector} declares no z-index`).not.toBeNull();
  return Number(match![1]);
}

describe('the operator queue row hover and confirm overlay', () => {
  it('washes the whole job row on hover so the pointer target is visible', () => {
    expect(rule('.admin-job-row:hover')).toMatch(/background:/);
    expect(rule('.admin-job-row.is-stalled:hover')).toMatch(/background:/);
  });

  it('stacks the confirm dialog over the preview theater and the install banners', () => {
    const overlay = zIndexOf('.admin-job-confirm-overlay');

    expect(overlay).toBeGreaterThan(zIndexOf('.admin-preview-overlay'));
    expect(overlay).toBeGreaterThan(zIndexOf('.install-prompt'));
  });
});
