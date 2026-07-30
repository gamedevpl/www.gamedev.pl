import { describe, expect, it } from 'vitest';
import { parseControls } from './howToPlay.js';

describe('parseControls', () => {
  it('splits on the semicolon when there is one, keeping commas inside a clause', () => {
    // apex-sprint, verbatim from the published catalog.
    expect(
      parseControls('A/D or Left/Right to steer; W/Up to accelerate; S/Down to brake; R to restart; M to mute'),
    ).toEqual(['A/D or Left/Right to steer', 'W/Up to accelerate', 'S/Down to brake', 'R to restart', 'M to mute']);
  });

  it('falls back to the comma so comma-delimited entries do not render as one line', () => {
    // block-cascade, verbatim: no semicolon anywhere, commas are the separator.
    expect(
      parseControls('Left/Right (A/D) to shift, Up/W/K to rotate, Down/S to soft drop, Space for hard drop, M to mute'),
    ).toEqual([
      'Left/Right (A/D) to shift',
      'Up/W/K to rotate',
      'Down/S to soft drop',
      'Space for hard drop',
      'M to mute',
    ]);
  });

  it('returns nothing for an empty or separator-only string, which is how the caller hides the control', () => {
    expect(parseControls('')).toEqual([]);
    expect(parseControls('   ')).toEqual([]);
    expect(parseControls(';;')).toEqual([]);
  });

  it('keeps a single clause with no separator as one row', () => {
    expect(parseControls('Tap anywhere to flap')).toEqual(['Tap anywhere to flap']);
  });

  it('passes markup through as literal text — escaping is the renderer’s job, not this parser’s', () => {
    // `controls` is agent-authored, prompt-influenced free text. It is rendered as a JSX
    // text node (never dangerouslySetInnerHTML); this pins the intent that the parser
    // does not strip, and therefore must never be fed to an HTML sink.
    expect(parseControls('<b>W</b> to jump')).toEqual(['<b>W</b> to jump']);
  });

  it('caps runaway rows so a prose blob cannot blow the card out of the viewport', () => {
    const long = `${'x'.repeat(400)}; W to jump`;
    const rows = parseControls(long);
    expect(rows).toHaveLength(2);
    expect(rows[0]).toHaveLength(160);
    expect(rows[0]?.endsWith('…')).toBe(true);

    const many = Array.from({ length: 40 }, (_, i) => `key ${i}`).join(';');
    expect(parseControls(many)).toHaveLength(14);
  });
});
