import { describe, expect, it } from 'vitest';
import { GAME_PREVIEW_CSP, GAME_PREVIEW_CSP_HEADER, withGamePreviewCsp } from './game-preview-csp.js';

const META_PREFIX = '<meta http-equiv="Content-Security-Policy"';

describe('game preview CSP', () => {
  it('blocks the network and carries nothing a meta tag would ignore', () => {
    expect(GAME_PREVIEW_CSP).toContain("default-src 'none'");
    expect(GAME_PREVIEW_CSP).toContain("connect-src 'none'");
    expect(GAME_PREVIEW_CSP).not.toMatch(/sandbox|frame-ancestors/);
    expect(GAME_PREVIEW_CSP_HEADER.startsWith('sandbox allow-scripts allow-pointer-lock; ')).toBe(true);
    expect(GAME_PREVIEW_CSP_HEADER).toContain(GAME_PREVIEW_CSP);
  });

  it('goes straight after the doctype, ahead of the head', () => {
    const out = withGamePreviewCsp('<!DOCTYPE html>\n<html><head><script>fetch("x")</script></head></html>');
    expect(out.startsWith(`<!DOCTYPE html>${META_PREFIX}`)).toBe(true);
    expect(out.indexOf(META_PREFIX)).toBeLessThan(out.indexOf('<script>'));
  });

  it('is not fooled by a script placed before <head> or a <head> in a comment', () => {
    const hostile = '<!doctype html><!-- <head> --><script>fetch("x")</script><head></head>';
    const out = withGamePreviewCsp(hostile);
    expect(out.indexOf(META_PREFIX)).toBeLessThan(out.indexOf('<!-- <head>'));
    expect(out.indexOf(META_PREFIX)).toBeLessThan(out.indexOf('<script>'));
  });

  it('prepends to a document with no doctype, html or head', () => {
    const out = withGamePreviewCsp('<script>fetch("x")</script>');
    expect(out.startsWith(META_PREFIX)).toBe(true);
    expect(out).toContain("connect-src 'none'");
  });

  it('scans a long run of unclosed comment openers in linear time', () => {
    const hostile = '<!--'.repeat(200_000);
    const started = performance.now();
    const out = withGamePreviewCsp(hostile);
    expect(performance.now() - started).toBeLessThan(500);
    expect(out.startsWith(META_PREFIX)).toBe(true);
    const closed = withGamePreviewCsp('<!---->'.repeat(100_000) + '<!doctype html>');
    expect(closed.indexOf(META_PREFIX)).toBe('<!---->'.length * 100_000 + '<!doctype html>'.length);
  });

  it.each([
    ['double-quoted', '<!DOCTYPE html SYSTEM "a>"><script>fetch("x")</script>'],
    ['single-quoted', "<!DOCTYPE html PUBLIC 'b>' 'c'><script>fetch('x')</script>"],
    ['unterminated double', '<!DOCTYPE html SYSTEM "a><script>fetch("x")</script>'],
    ['unterminated single', "<!DOCTYPE html SYSTEM 'a><script>fetch('x')</script>"],
  ])('prepends when a %s doctype identifier could hide the real end', (_, html) => {
    expect(withGamePreviewCsp(html)).toBe(`${withGamePreviewCsp('')}${html}`);
  });

  it.each([
    ['<!-->', '<!--><script>fetch("x")</script><!-- --><!doctype html>'],
    ['<!--->', '<!---><script>fetch("x")</script><!-- --><!doctype html>'],
    ['--!>', '<!-- a --!><script>fetch("x")</script><!-- --><!doctype html>'],
  ])('prepends when %s closes a comment early', (_, html) => {
    expect(withGamePreviewCsp(html).startsWith(META_PREFIX)).toBe(true);
  });

  it('keeps comments and ASCII whitespace that precede the doctype before it', () => {
    const out = withGamePreviewCsp('\t\r\n\f <!-- built --> <!doctype html><p>hi</p>');
    expect(out.startsWith(`\t\r\n\f <!-- built --> <!doctype html>${META_PREFIX}`)).toBe(true);
  });

  it.each([
    ['NBSP', '\u00A0'],
    ['BOM, which srcdoc never strips', '\uFEFF'],
    ['em space', '\u2003'],
    ['line separator', '\u2028'],
    ['vertical tab', '\v'],
  ])('prepends when a leading %s would open the body first', (_, space) => {
    const html = `${space}<!doctype html><script>fetch("x")</script>`;
    expect(withGamePreviewCsp(html)).toBe(`${withGamePreviewCsp('')}${html}`);
  });
});
