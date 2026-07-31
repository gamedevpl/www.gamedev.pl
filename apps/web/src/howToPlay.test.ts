import { describe, expect, it } from 'vitest';
import { parseControls, readReportedControls, resolveControlRows } from './howToPlay.js';

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

describe('readReportedControls', () => {
  it('takes the rows a game reported about itself', () => {
    const controls = readReportedControls({
      rows: [
        { keys: 'A/D', action: 'Steer' },
        { keys: 'Space', action: 'Fire' },
      ],
      kit: [],
      hint: 'A/D steer, Space fire',
    });
    expect(controls?.rows).toEqual([
      { keys: 'A/D', action: 'Steer' },
      { keys: 'Space', action: 'Fire' },
    ]);
  });

  it('returns null for anything that carries nothing usable, which is the fallback signal', () => {
    // Every one of these is reachable: a game with no how-to-play markup, a frame that
    // died before GameKit ran, and a hostile frame posting whatever it likes.
    expect(readReportedControls({ rows: [], kit: [], hint: '' })).toBeNull();
    expect(readReportedControls(null)).toBeNull();
    expect(readReportedControls('rows')).toBeNull();
    expect(readReportedControls({ rows: 'not an array', kit: 42, hint: { nope: true } })).toBeNull();
    expect(readReportedControls({ rows: [null, 7, 'x', { keys: 'A' }] })).toBeNull();
  });

  it('caps count and length, because this arrives from an AI-authored document', () => {
    const controls = readReportedControls({
      rows: Array.from({ length: 60 }, (_, i) => ({ keys: `k${i}`, action: `a${i}` })),
      kit: [],
      hint: '',
    });
    expect(controls?.rows).toHaveLength(14);

    const long = readReportedControls({ rows: [{ keys: 'k'.repeat(500), action: 'a'.repeat(500) }] });
    expect(long?.rows[0]?.keys).toHaveLength(80);
    expect(long?.rows[0]?.action.endsWith('…')).toBe(true);
  });

  it('spends the length budget on visible text, not on whitespace', () => {
    // Padding is collapsed before measuring; otherwise a game could push its real text
    // past the cap with newlines and leave a blank row on the card.
    const controls = readReportedControls({ rows: [{ keys: `${' '.repeat(200)}A/D`, action: '  Steer\n\n  ' }] });
    expect(controls?.rows).toEqual([{ keys: 'A/D', action: 'Steer' }]);
  });

  it('passes markup through as text — the panel is the only thing that renders it', () => {
    const controls = readReportedControls({ rows: [{ keys: '<img src=x onerror=alert(1)>', action: 'Jump' }] });
    expect(controls?.rows[0]?.keys).toBe('<img src=x onerror=alert(1)>');
  });

  it('reads a mounted pad out of the GameKit rows', () => {
    expect(readReportedControls({ kit: [{ pad: 'full' }] })?.pad).toBe(true);
    expect(readReportedControls({ kit: [{ keys: 'Space', action: 'Fire' }] })?.pad).toBe(false);
  });
});

describe('resolveControlRows', () => {
  const catalog = 'Left/Right to move; Space to fire';

  it('prefers what the game says about itself over what the catalog says about it', () => {
    // The catalog string is a SPEC claim that can drift from the code; the reported rows
    // are this document's own account, and are in the player's language.
    const reported = readReportedControls({ rows: [{ keys: 'A/D', action: 'Skręt' }] });
    expect(resolveControlRows(reported, catalog)).toEqual([{ keys: 'A/D', action: 'Skręt' }]);
  });

  it('falls back to the catalog when the game reported no structured rows', () => {
    expect(resolveControlRows(null, catalog)).toEqual([
      { keys: 'Left/Right', action: 'move' },
      { keys: 'Space', action: 'fire' },
    ]);
  });

  it('uses the one-line hint only when there is nothing else at all', () => {
    // A deep link to a game with no legend markup: no catalog, no rows — but every game
    // in the repo ships a `.hint`, so the card still has something true to show.
    const reported = readReportedControls({ rows: [], kit: [], hint: 'W/A/S/D to move, Space to jump' });
    expect(resolveControlRows(reported, '')).toEqual([
      { keys: 'W/A/S/D', action: 'move' },
      { keys: 'Space', action: 'jump' },
    ]);
    // …and never in place of a real source.
    expect(resolveControlRows(reported, catalog)[0]).toEqual({ keys: 'Left/Right', action: 'move' });
  });

  it('appends GameKit touch buttons rather than merging them, since no keyboard row names them', () => {
    const reported = readReportedControls({
      rows: [{ keys: 'A/D', action: 'Steer' }],
      kit: [{ keys: 'Space', action: 'Fire', touch: true }],
    });
    expect(resolveControlRows(reported, catalog)).toEqual([
      { keys: 'A/D', action: 'Steer' },
      { keys: 'Space', action: 'Fire' },
    ]);
  });

  it('still caps the total once both sources have contributed', () => {
    const reported = readReportedControls({
      rows: Array.from({ length: 10 }, (_, i) => ({ keys: `k${i}`, action: `a${i}` })),
      kit: Array.from({ length: 10 }, (_, i) => ({ keys: `b${i}`, action: `f${i}` })),
    });
    expect(resolveControlRows(reported, catalog)).toHaveLength(14);
  });

  it('returns nothing when no source has anything, which is how the control stays hidden', () => {
    expect(resolveControlRows(null, '')).toEqual([]);
  });
});

describe('pad buttons read off the built pad', () => {
  it('names the Touch row instead of becoming key rows with no keys', () => {
    // These carry a label but no key, because on a touch device the key behind a button
    // is not the question. Rendering them as key rows would show a column of blanks.
    const controls = readReportedControls({
      rows: [{ keys: 'A/D', action: 'Steer' }],
      kit: [
        { keys: '', action: 'Fire', touch: true },
        { keys: '', action: 'Throttle', touch: true },
        { keys: '', action: '', pad: 'full' },
      ],
    });
    expect(controls?.padButtons).toEqual(['Fire', 'Throttle']);
    expect(controls?.pad).toBe(true);
    expect(resolveControlRows(controls, '')).toEqual([{ keys: 'A/D', action: 'Steer' }]);
  });

  it('still makes manifest buttons real rows, because those do know their key', () => {
    const controls = readReportedControls({
      kit: [{ keys: 'Space', action: 'Fire', touch: true }],
    });
    expect(controls?.padButtons).toEqual([]);
    expect(controls?.kit).toEqual([{ keys: 'Space', action: 'Fire' }]);
  });

  it('is enough on its own to show the card for a game that reported nothing else', () => {
    const controls = readReportedControls({ kit: [{ keys: '', action: 'Fire', touch: true }] });
    expect(controls).not.toBeNull();
    expect(controls?.padButtons).toEqual(['Fire']);
  });
});
