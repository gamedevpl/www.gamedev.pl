import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const css = readFileSync(fileURLToPath(new URL('./review.css', import.meta.url)), 'utf8').replace(
  /\/\*[\s\S]*?\*\//g,
  '',
);

function ruleBody(selector: string): string {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const match = new RegExp(`(?:^|})\\s*${escaped}\\s*\\{([^}]+)\\}`, 'm').exec(css);
  expect(match, `no ${selector} rule in review.css`).not.toBeNull();
  return match![1]!;
}

// Refuse a revert that drops the review shell or keyboard escape path.
describe('review desk shell', () => {
  it('claims the window while the desk is mounted', () => {
    expect(css).toMatch(/\.app:has\(\.review-desk\)\s*\{/);
    expect(ruleBody('.app:has(.review-desk)')).toMatch(/height:\s*100dvh/);
    expect(ruleBody('.app:has(.review-desk)')).toMatch(/overflow:\s*hidden/);
    expect(css).toMatch(/\.app:has\(\.review-desk\)\s*>\s*\.content\s*\{/);
    expect(css).toMatch(/\.app:has\(\.review-desk\)\s*\.site-footer\s*\{/);
  });

  it('pulls install/update banners into the column instead of covering the dock', () => {
    expect(css).toMatch(
      /\.app:has\(\.review-desk\)\s*\.install-prompt\s*,\s*\.app:has\(\.review-desk\)\s*\.app-update\s*\{[\s\S]*?position:\s*static/,
    );
    expect(css).not.toMatch(/--review-overlay-lift/);
  });

  it('keeps a floor under the media scroller and a ceiling on the dock', () => {
    const scroll = ruleBody('.review-scroll');
    expect(scroll).toMatch(/min-height:\s*min\(32dvh,\s*200px\)/);
    expect(scroll).toMatch(/flex:\s*1\s+1\s+40%/);

    const dock = ruleBody('.review-dock');
    expect(dock).toMatch(/max-height:\s*min\(48dvh,\s*420px\)/);
    expect(dock).toMatch(/min-height:\s*0/);
    expect(dock).toMatch(/overflow-y:\s*auto/);
    expect(dock).not.toMatch(/position:\s*sticky/);

    const checklist = ruleBody('.review-checklist');
    expect(checklist).toMatch(/flex:\s*none/);
    expect(checklist).toMatch(/overflow:\s*visible/);

    const play = ruleBody('.review-play-btn.is-overlay');
    expect(play).toMatch(/top:\s*0\.55rem/);
    expect(play).not.toMatch(/bottom:\s*0\.55rem/);
    expect(play).toMatch(/background:\s*var\(--turquoise\)/);
    expect(play).toMatch(/color:\s*#08241d/);
    expect(play).toMatch(/border-color:\s*var\(--turquoise\)/);

    const keep = ruleBody('.review-stamp.is-keep');
    expect(keep).toMatch(/left:\s*50%/);
    expect(keep).toMatch(/right:\s*auto/);
    expect(keep).toMatch(/translateX\(-50%\)/);
  });
});

// Phone override must load after review.css or it loses the cascade.
describe('review desk phone overrides', () => {
  const responsiveCss = readFileSync(
    fileURLToPath(new URL('./review.responsive.css', import.meta.url)),
    'utf8',
  ).replace(/\/\*[\s\S]*?\*\//g, '');
  const tsx = readFileSync(fileURLToPath(new URL('./ReviewDesk.tsx', import.meta.url)), 'utf8');

  it('shrinks the dock and scroller under the 640px breakpoint', () => {
    expect(responsiveCss).toMatch(/@media \(max-width: 640px\) \{/);
    expect(responsiveCss).toMatch(/\.review-scroll\s*\{[^}]*min-height:\s*min\(28dvh,\s*160px\)/);
    expect(responsiveCss).toMatch(/\.review-dock\s*\{[^}]*max-height:\s*min\(52dvh,\s*380px\)/);
  });

  it('imports review.responsive.css after review.css so the override wins', () => {
    const baseIndex = tsx.indexOf("import './review.css'");
    const responsiveIndex = tsx.indexOf("import './review.responsive.css'");
    expect(baseIndex).toBeGreaterThan(-1);
    expect(responsiveIndex).toBeGreaterThan(baseIndex);
  });
});
