import { describe, expect, it } from 'vitest';
import { parseControls } from './howToPlay.js';

describe('parseControls', () => {
  it('splits on the semicolon when there is one, keeping commas inside a clause', () => {
    // apex-sprint, verbatim from the published catalog.
    expect(
      parseControls('A/D or Left/Right to steer; W/Up to accelerate; S/Down to brake; R to restart; M to mute'),
    ).toEqual([
      { keys: 'A/D or Left/Right', action: 'steer' },
      { keys: 'W/Up', action: 'accelerate' },
      { keys: 'S/Down', action: 'brake' },
      { keys: 'R', action: 'restart' },
      { keys: 'M', action: 'mute' },
    ]);
  });

  it('falls back to the comma so comma-delimited entries do not render as one line', () => {
    // block-cascade, verbatim: no semicolon anywhere, commas are the separator.
    expect(parseControls('Left/Right (A/D) to shift, Up/W/K to rotate, Space for hard drop, M to mute')).toEqual([
      { keys: 'Left/Right (A/D)', action: 'shift' },
      { keys: 'Up/W/K', action: 'rotate' },
      { keys: 'Space', action: 'hard drop' },
      { keys: 'M', action: 'mute' },
    ]);
  });

  it('keeps a clause whole when splitting it would be a guess', () => {
    // beat-teacher, verbatim. The semicolons are what keep the comma-listed keys in the
    // first clause together, and that clause has no key/action shape to split on.
    expect(
      parseControls('Press A, S, D, F, or Space in sync with scrolling rhythm note prompts; R to restart; M to mute'),
    ).toEqual([
      { keys: '', action: 'Press A, S, D, F, or Space in sync with scrolling rhythm note prompts' },
      { keys: 'R', action: 'restart' },
      { keys: 'M', action: 'mute' },
    ]);
    // paddle-duel, verbatim: comma-delimited, keys in parentheses, no " to " anywhere —
    // every row stays whole rather than being split on a separator that is not there.
    expect(parseControls('Player 1 (W/S), Player 2 / AI (Up/Down Arrow), Mute (M)')).toEqual([
      { keys: '', action: 'Player 1 (W/S)' },
      { keys: '', action: 'Player 2 / AI (Up/Down Arrow)' },
      { keys: '', action: 'Mute (M)' },
    ]);
    expect(parseControls('Tap anywhere to flap')).toEqual([{ keys: 'Tap anywhere', action: 'flap' }]);
    // A clause that opens with the separator has no key half worth showing.
    expect(parseControls('to jump')).toEqual([{ keys: '', action: 'to jump' }]);
  });

  it('returns nothing for an empty or separator-only string, which is how the caller hides the control', () => {
    expect(parseControls('')).toEqual([]);
    expect(parseControls('   ')).toEqual([]);
    expect(parseControls(';;')).toEqual([]);
  });

  it('passes markup through as literal text — escaping is the renderer’s job, not this parser’s', () => {
    // `controls` is agent-authored, prompt-influenced free text. It is rendered as a JSX
    // text node (never dangerouslySetInnerHTML); this pins the intent that the parser
    // does not strip, and therefore must never be fed to an HTML sink.
    expect(parseControls('<b>W</b> to jump')).toEqual([{ keys: '<b>W</b>', action: 'jump' }]);
  });

  it('caps runaway rows so a prose blob cannot blow the card out of the viewport', () => {
    const rows = parseControls(`${'x'.repeat(400)}; W to jump`);
    expect(rows).toHaveLength(2);
    expect(rows[0]?.keys).toBe('');
    expect(rows[0]?.action).toHaveLength(160);
    expect(rows[0]?.action.endsWith('…')).toBe(true);

    const many = Array.from({ length: 40 }, (_, i) => `key${i} to act`).join(';');
    expect(parseControls(many)).toHaveLength(14);
  });

  it('keeps repeated clauses rather than deduping them — the renderer must not key on text', () => {
    // Two identical clauses, and two long clauses that truncate to the same string, both
    // occur in free text. The panel keys rows by index because of this.
    expect(parseControls('Space to jump; Space to jump')).toHaveLength(2);
    const twins = `${'y'.repeat(200)}a; ${'y'.repeat(200)}b`;
    const truncated = parseControls(twins);
    expect(truncated[0]?.action).toBe(truncated[1]?.action);
  });
});
