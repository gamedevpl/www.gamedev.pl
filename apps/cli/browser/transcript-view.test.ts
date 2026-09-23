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
