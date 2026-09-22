import { expect, it } from 'vitest';
import { lineStyle } from './transcript-style.js';

it('marks failures and reported agent blockers red', () => {
  expect(lineStyle('Validation needs changes').tone).toBe('red');
  expect(lineStyle('Agent blocked: blocked: visual check unconfirmed').tone).toBe('red');
});

it('labels prompts, checks and agent lines like the terminal', () => {
  expect(lineStyle('› make it faster')).toMatchObject({ label: 'YOU', tone: 'cyan' });
  expect(lineStyle('verifying — typecheck').label).toBe('CHECK');
  expect(lineStyle('codex ▸ Tuning grip').tone).toBe('magenta');
});
