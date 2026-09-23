import { expect, it } from 'vitest';
import { lineStyle } from './transcript-style.js';

it('marks failures and reported agent blockers red', () => {
  expect(lineStyle('Validation needs changes').tone).toBe('red');
  expect(lineStyle('Agent blocked: blocked: visual check unconfirmed').tone).toBe('red');
  for (const line of [
    'codex stopped (exit 1). Task completion is not confirmed.',
    'codex stopped: the selected model is at capacity. Task completion is not confirmed.',
    'Codex stopped before confirming completion.',
    'Verification failed at check_static: prose',
    'Local capture failed: timeout',
    'Tool failed: shell',
    'Sending failed.',
    'Agent rejected the request.',
    'codex ▸ Tool failed: shell — exit 2',
    'cannot check the checkout against the platform — network down',
    'Browser could not open. Copy the Play session URL above.',
    'sign-in failed — run `gamedevpl login` again',
    'delivery refused: moderation',
    'Interactive Antigravity stopped without success. Edits remain local; /diff to inspect.',
    'Muse stopped — files remain at /tmp/work',
    'sources accepted but the gate did not start — a preview is not assembling',
    'No game files changed. Task completion is not confirmed; static checks and delivery were skipped.',
    'codex could not obtain tool permissions in headless mode. No successful edit is confirmed; review and retry.',
  ])
    expect(lineStyle(line).tone, line).toBe('red');
});

it('flags uncertain outcomes as warnings, not failures', () => {
  expect(lineStyle('Delivery outcome unknown: agent acknowledgement timed out.').tone).toBe('yellow');
  expect(lineStyle('Kit update check timed out. Retry with /kit.').tone).toBe('yellow');
  expect(lineStyle('Returned from Codex (0). This does not confirm delivery; check Studio.').tone).toBe('yellow');
  expect(lineStyle('Local task tools unavailable: offline').tone).toBe('yellow');
  expect(lineStyle('Tests 12 passed, 0 failed').tone).toBeUndefined();
  expect(lineStyle('Missing browser access prevents visual verification, not code changes.').tone).toBeUndefined();
  expect(lineStyle('codex ▸ the request timed out once').tone).toBe('magenta');
  expect(lineStyle('codex ▸ The test failed, so I tuned grip.').tone).toBe('magenta');
  expect(lineStyle('Agent stopped.').tone).toBeUndefined();
  expect(lineStyle('Some tools were denied; this alone does not mean the task failed.').tone).not.toBe('red');
});

it('labels prompts, checks and agent lines like the terminal', () => {
  expect(lineStyle('› make it faster')).toMatchObject({ label: 'YOU', tone: 'cyan' });
  expect(lineStyle('verifying — typecheck').label).toBe('CHECK');
  expect(lineStyle('codex ▸ Tuning grip').tone).toBe('magenta');
});
