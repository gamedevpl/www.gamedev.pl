import { expect, it } from 'vitest';
import { headline, trimUrl } from './transcript-view.js';

it('summarises a block by its latest outcome', () => {
  expect(headline(['verifying — typecheck', '✓ static ladder green']).style.label).toBe('PASS');
  expect(
    headline(['Validation needs changes', 'Sending validation errors back to the same agent', '✓ static ladder green'])
      .style.tone,
  ).toBe('green');
  expect(headline(['verifying — typecheck', 'verify failed at check_static']).style.tone).toBe('red');
});

it('keeps a failure visible behind later warnings and progress', () => {
  const top = headline(['Tool failed: shell', 'Update available: 0.20.0', 'verifying — typecheck']);
  expect(top.line).toBe('Tool failed: shell');
});

it('keeps prose punctuation out of links but keeps balanced brackets', () => {
  expect(trimUrl('https://example.test/game).')).toBe('https://example.test/game');
  expect(trimUrl('https://example.test/game,')).toBe('https://example.test/game');
  expect(trimUrl('https://en.wikipedia.org/wiki/Kart_(racing)')).toBe('https://en.wikipedia.org/wiki/Kart_(racing)');
  expect(trimUrl('https://example.test/a?b=1')).toBe('https://example.test/a?b=1');
});

it('lets a gate that never started supersede the delivery acknowledgement', () => {
  const top = headline([
    'delivery accepted racer @ 3 (preview)',
    'sources accepted but the gate did not start — a preview is not assembling',
  ]);
  expect(top.style.tone).toBe('red');
});

it('opens command failures reported through formatError', () => {
  const top = headline([
    'Checkout destination is not empty; your files were left untouched.',
    'next: Choose another directory: gamedevpl checkout racer ./racer-2',
  ]);
  expect(top.style.tone).toBe('red');
});

it('ships no regex lookbehind to the browser (Safari 16.0–16.3 cannot parse it)', async () => {
  const { PLAY_CLIENT } = await import('../src/generated/play-ui.js');
  const { SESSION_BROWSER_SCRIPT } = await import('../src/session-browser-script.js');
  expect(PLAY_CLIENT + SESSION_BROWSER_SCRIPT).not.toMatch(/\(\?<[!=]/);
});

it('does not highlight path segments as slash commands', async () => {
  const { renderToStaticMarkup } = await import('react-dom/server');
  const { createElement } = await import('react');
  const { RichText } = await import('./transcript-view.js');
  const html = renderToStaticMarkup(createElement(RichText, { text: 'mime image/png, run /diff' }));
  expect(html).toBe('mime image/png, run <span class="tl-command">/diff</span>');
});
