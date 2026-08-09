import { describe, it, expect } from 'vitest';
import { embedGameHtml, withGameLocale } from './gamePlayer.js';

describe('embedGameHtml', () => {
  it('injects the hide-chrome style and bridge script in <head> before game code', () => {
    const html = '<html><head></head><body><canvas id="game"></canvas></body></html>';
    const out = embedGameHtml(html);

    // Style + script land inside <head> so rAF patches precede game scripts.
    expect(out).toContain('<style id="gdpl-embed">');
    expect(out).toContain('#game-title,#game-desc,.game-controls,.hint{display:none!important}');
    // Desktop mouse: hide buttons-only GameKit chrome (pointer-native tactics UIs).
    expect(out).toContain('@media not all and (any-pointer:coarse)');
    expect(out).toContain('.gamekit-touch:not(:has(.gamekit-touch-pad))');
    expect(out).toContain('gdpl-player');
    expect(out.indexOf('<style id="gdpl-embed">')).toBeLessThan(out.indexOf('</head>'));
    expect(out.indexOf('<script>')).toBeLessThan(out.indexOf('</head>'));
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

  it('holds rAF on pause and still dispatches gdpl-pause for GameKit', () => {
    const out = embedGameHtml('<html><head></head><body></body></html>');
    expect(out).toContain("CustomEvent('gdpl-pause')");
    expect(out).toContain("CustomEvent('gdpl-resume')");
    // Bridge freezes rAF; GameKit alone would keep drawing.
    expect(out).toContain('heldRaf');
    expect(out).toContain('flushHeldRaf');
    expect(out).toContain('suspendAudio');
  });

  it('suppresses the iOS long-press loupe and Copy/Translate callout inside the frame', () => {
    const out = embedGameHtml('<html><head></head><body><canvas id="game"></canvas></body></html>');

    // Opaque-origin frame; parent CSS cannot reach in.
    expect(out).toContain('-webkit-touch-callout:none');
    expect(out).toContain('-webkit-user-select:none');
    expect(out).toContain('user-select:none');
    expect(out).toContain('touch-action:none');
    // Event backstops when CSS alone is not enough.
    expect(out).toContain("addEventListener('contextmenu'");
    expect(out).toContain("addEventListener('selectstart'");
  });

  it('makes the shell wrap full-bleed so desktop theater has no 1400px gutters', () => {
    const out = embedGameHtml(
      '<html><head></head><body><div class="wrap"><canvas id="game"></canvas></div></body></html>',
    );

    // Drop shell's 1400px wrap gutters.
    expect(out).toContain('.wrap{width:100%!important;max-width:none!important');
    expect(out).toContain('padding:0!important');
    // Fit the box to the logical bitmap without object-fit hitbox offsets.
    expect(out).toContain(
      '#game{--gdpl-canvas-ratio:1.6;--gdpl-embed-width:100%;--gdpl-embed-height:100dvh;flex:0 1 auto!important;width:min(var(--gdpl-embed-width),calc(var(--gdpl-embed-height) * var(--gdpl-canvas-ratio)))!important;',
    );
    expect(out).toContain('aspect-ratio:var(--gdpl-canvas-ratio)!important');
    expect(out).toContain('max-width:100%!important');
    expect(out).toContain('max-height:100%!important');
    expect(out).not.toContain('#game{width:auto!important;height:auto!important');
    expect(out).not.toContain('#game{width:100%!important;height:100%!important');
    expect(out).not.toContain('object-fit:contain');
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
