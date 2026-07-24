import { describe, it, expect } from 'vitest';
import { embedGameHtml, withGameLocale } from './gamePlayer';

describe('embedGameHtml', () => {
  it('injects the hide-chrome style and bridge script before </body>', () => {
    const html = '<html><head></head><body><canvas id="game"></canvas></body></html>';
    const out = embedGameHtml(html);

    // Style + script land inside the document, before the closing body tag.
    expect(out).toContain('<style id="gdpl-embed">');
    expect(out).toContain('#game-title,#game-desc,.game-controls,.hint{display:none!important}');
    expect(out).toContain('gdpl-player');
    expect(out.indexOf('<style id="gdpl-embed">')).toBeLessThan(out.indexOf('</body>'));
    expect(out.indexOf('<script>')).toBeLessThan(out.indexOf('</body>'));
    // Original game content is preserved.
    expect(out).toContain('<canvas id="game">');
  });

  it('relays Escape to the host, since the focused game swallows its own keys', () => {
    const out = embedGameHtml('<html><body><canvas id="game"></canvas></body></html>');

    expect(out).toContain("addEventListener('keydown'");
    expect(out).toContain("e.key==='Escape'");
    expect(out).toContain("type:'key'");
  });

  it('appends the injection when there is no </body>', () => {
    const out = embedGameHtml('<canvas id="game"></canvas>');
    expect(out.startsWith('<canvas id="game"></canvas>')).toBe(true);
    expect(out).toContain('<style id="gdpl-embed">');
    expect(out).toContain('<script>');
  });
});

describe('withGameLocale', () => {
  it('rewrites the assembled document <html lang> to the app locale', () => {
    const html = '<!doctype html><html lang="en"><head></head><body></body></html>';
    const out = withGameLocale(html, 'pl');
    expect(out).toContain('<html lang="pl">');
    expect(out).not.toContain('lang="en"');
  });

  it('maps regional/unknown languages down to the en/pl a game ships', () => {
    const html = '<html lang="en"></html>';
    expect(withGameLocale(html, 'pl-PL')).toContain('lang="pl"');
    expect(withGameLocale(html, 'de')).toContain('lang="en"');
    expect(withGameLocale(html, undefined)).toContain('lang="en"');
  });

  it('adds a lang attribute when the <html> tag has none', () => {
    expect(withGameLocale('<html><body></body></html>', 'pl')).toContain('<html lang="pl">');
  });

  it('leaves fragments without an <html> tag untouched', () => {
    expect(withGameLocale('<canvas></canvas>', 'pl')).toBe('<canvas></canvas>');
  });
});
