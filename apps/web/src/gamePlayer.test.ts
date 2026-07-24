import { describe, it, expect } from 'vitest';
import { embedGameHtml } from './gamePlayer';

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

  it('appends the injection when there is no </body>', () => {
    const out = embedGameHtml('<canvas id="game"></canvas>');
    expect(out.startsWith('<canvas id="game"></canvas>')).toBe(true);
    expect(out).toContain('<style id="gdpl-embed">');
    expect(out).toContain('<script>');
  });
});
