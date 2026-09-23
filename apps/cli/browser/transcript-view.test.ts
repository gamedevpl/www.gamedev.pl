import { expect, it } from 'vitest';
import { headline } from './transcript-view.js';

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
