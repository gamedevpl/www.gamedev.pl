import { describe, it, expect } from 'vitest';
import {
  AGENT_MAX_FRAMES,
  AGENT_OBSERVATION_EMPTY,
  AGENT_PLAY_MAX_MS,
  AGENT_SHARED_COMMANDS,
  agentModeRequested,
  formatAffordances,
  formatApi,
  formatObservation,
  formatSnapshotText,
  mergeAgentLog,
  parseAgentCommand,
  redactSnapshot,
} from './agentPlay.js';

describe('parseAgentCommand', () => {
  it('ignores blank lines and comments so a pasted plan runs unchanged', () => {
    expect(parseAgentCommand('')).toBeNull();
    expect(parseAgentCommand('   ')).toBeNull();
    expect(parseAgentCommand('# walk right, then jump')).toBeNull();
  });

  it('reads the verbs the CLI harness uses', () => {
    expect(parseAgentCommand('look')).toEqual({ kind: 'look' });
    expect(parseAgentCommand('state')).toEqual({ kind: 'look' });
    expect(parseAgentCommand('step')).toEqual({ kind: 'step', frames: 1 });
    expect(parseAgentCommand('step 12')).toEqual({ kind: 'step', frames: 12 });
    expect(parseAgentCommand('wait 3')).toEqual({ kind: 'step', frames: 3 });
    expect(parseAgentCommand('restart')).toEqual({ kind: 'restart' });
  });

  it('resolves key aliases the way GameKit names keys', () => {
    expect(parseAgentCommand('tap space')).toEqual({ kind: 'tap', key: ' ', code: 'Space' });
    expect(parseAgentCommand('press right 12')).toEqual({
      kind: 'press',
      key: 'ArrowRight',
      code: 'ArrowRight',
      frames: 12,
    });
    // A bare alias is a press: `left 8` holds for eight frames.
    expect(parseAgentCommand('left 8')).toEqual({ kind: 'press', key: 'ArrowLeft', code: 'ArrowLeft', frames: 8 });
    // Single letters become a KeyboardEvent code; names pass through.
    expect(parseAgentCommand('tap q')).toEqual({ kind: 'tap', key: 'q', code: 'KeyQ' });
    expect(parseAgentCommand('tap ArrowUp')).toEqual({ kind: 'tap', key: 'ArrowUp', code: 'ArrowUp' });
  });

  it('tells a held key from a bare arrow', () => {
    expect(parseAgentCommand('down x')).toEqual({ kind: 'keyDown', key: 'x', code: 'KeyX' });
    expect(parseAgentCommand('up x')).toEqual({ kind: 'keyUp', key: 'x', code: 'KeyX' });
    // `down 5` is the arrow key, not a malformed hold.
    expect(parseAgentCommand('down 5')).toEqual({ kind: 'press', key: 'ArrowDown', code: 'ArrowDown', frames: 5 });
  });

  it('reads pointer verbs in normalized canvas coordinates', () => {
    expect(parseAgentCommand('click 0.5 0.25')).toEqual({ kind: 'click', x: 0.5, y: 0.25 });
    expect(parseAgentCommand('move 0 1')).toEqual({ kind: 'move', x: 0, y: 1 });
    expect(parseAgentCommand('drag 0.1 0.2 0.8 0.9 6')).toEqual({
      kind: 'drag',
      from: { x: 0.1, y: 0.2 },
      to: { x: 0.8, y: 0.9 },
      frames: 6,
    });
    expect(parseAgentCommand('tilt -0.5')).toEqual({ kind: 'tilt', x: -0.5, y: 0 });
  });

  it('reads the three verbs only a live page has', () => {
    expect(parseAgentCommand('play')).toEqual({ kind: 'playFor', ms: 1000 });
    expect(parseAgentCommand('play 250ms')).toEqual({ kind: 'playFor', ms: 250 });
    expect(parseAgentCommand('play 1.5s')).toEqual({ kind: 'playFor', ms: 1500 });
    expect(parseAgentCommand('live')).toEqual({ kind: 'live' });
    // `quit` means what it does in the CLI: stop driving.
    expect(parseAgentCommand('quit')).toEqual({ kind: 'live' });
    expect(parseAgentCommand('screenshot')).toEqual({ kind: 'screenshot' });
  });

  it('refuses input that would freeze the tab or read as a silent no-op', () => {
    expect(() => parseAgentCommand('step 0')).toThrow(/positive integer/);
    expect(() => parseAgentCommand('step 1.5')).toThrow(/positive integer/);
    expect(() => parseAgentCommand(`step ${AGENT_MAX_FRAMES + 1}`)).toThrow(/at most/);
    expect(() => parseAgentCommand(`play ${AGENT_PLAY_MAX_MS + 1}`)).toThrow(/use live/);
    expect(() => parseAgentCommand('click 2 2')).toThrow(/0\.\.1/);
    expect(() => parseAgentCommand('click 0.5')).toThrow(/requires x y/);
    expect(() => parseAgentCommand('tilt 4')).toThrow(/-1\.\.1/);
    expect(() => parseAgentCommand('press')).toThrow(/requires a key/);
    expect(() => parseAgentCommand('teleport')).toThrow(/unknown command/);
    expect(() => parseAgentCommand('call')).toThrow(/helper name/);
    expect(() => parseAgentCommand('call camLookAt not-json')).toThrow(/JSON/);
  });

  it('parses call with no args, an array, or one object', () => {
    expect(parseAgentCommand('call camLookAt')).toEqual({ kind: 'call', name: 'camLookAt', args: [] });
    expect(parseAgentCommand('call camLookAt [8, 12]')).toEqual({
      kind: 'call',
      name: 'camLookAt',
      args: [8, 12],
    });
    expect(parseAgentCommand('call buyVehicle {"kind":"train"}')).toEqual({
      kind: 'call',
      name: 'buyVehicle',
      args: [{ kind: 'train' }],
    });
  });
});

// Neither repo imports the other; parity is pinned as a literal.
describe('grammar parity with the games repo', () => {
  const GAMES_REPO_COMMAND_HELP = [
    'help',
    'look | state',
    'step [n]',
    'left|right|up|down|space [n]',
    'tap <key>',
    'down <key>',
    'up <key>',
    'press <key> [n]',
    'click <x> <y>   # 0..1 canvas coords',
    'move <x> <y>    # 0..1 canvas coords, no button',
    'drag <x1> <y1> <x2> <y2> [n]   # 0..1 canvas coords',
    'tilt <x> [y]    # -1..1 normalized device tilt',
    'restart',
    'call <name> [json]   # named helper the game registered',
  ];

  it('offers exactly the shared verbs, worded the same way', () => {
    expect([...AGENT_SHARED_COMMANDS]).toEqual(GAMES_REPO_COMMAND_HELP);
  });

  it('parses every shared verb it advertises', () => {
    const samples = [
      'help',
      'look',
      'step 2',
      'left 2',
      'tap space',
      'down a',
      'up a',
      'press a 2',
      'click 0.5 0.5',
      'move 0.5 0.5',
      'drag 0 0 1 1 2',
      'tilt 0.5 0.5',
      'restart',
      'call camLookAt [8, 12]',
    ];
    for (const sample of samples) expect(parseAgentCommand(sample)).not.toBeNull();
  });
});

describe('snapshot text', () => {
  it('sorts keys and quotes values, matching the CLI one-line format', () => {
    const text = formatSnapshotText(12, { score: 3, state: 'playing', lives: 2 });
    expect(text).toBe('frame=12 lives=2 score=3 state="playing"');
  });

  it('drops fields the game declared hidden', () => {
    const snapshot = { state: 'playing', targetWord: 'HORSE', guesses: 2 };
    expect(redactSnapshot(snapshot, ['targetWord'])).toEqual({ state: 'playing', guesses: 2 });
    expect(formatSnapshotText(4, snapshot, ['targetWord'])).not.toContain('HORSE');
  });

  it('withholds nothing when the document declares no list', () => {
    // Visible gap until the document carries AGENT.json hiddenFields.
    expect(redactSnapshot({ targetWord: 'HORSE' }, null)).toEqual({ targetWord: 'HORSE' });
  });
});

describe('describing the screen', () => {
  it('gives each widget the coordinates click wants', () => {
    const text = formatAffordances([
      { label: 'Restart', enabled: true, x1: 0, y1: 0, x2: 0.2, y2: 0.1 },
      { label: 'Hint', enabled: false, detail: 'costs 10 gold', x1: 0.8, y1: 0.9, x2: 1, y2: 1 },
    ]);
    expect(text).toContain('[Restart] click 0.10 0.05');
    expect(text).toContain('[Hint] click 0.90 0.95 (disabled, costs 10 gold)');
  });

  it('says an empty list is not proof there are no controls', () => {
    expect(formatAffordances([])).toContain('keyboard controls may still exist');
  });

  it('pretty-prints a game-authored observation, and passes prose through', () => {
    expect(formatObservation('{"room":"cellar"}')).toContain('"room": "cellar"');
    expect(formatObservation('a dark cellar')).toBe('a dark cellar');
    expect(formatObservation({ tool: 'rail' })).toContain('"tool": "rail"');
    expect(formatObservation(undefined)).toBeNull();
    expect(formatObservation('')).toBeNull();
  });

  it('lists registered helpers so a creator can see them without eval', () => {
    expect(formatApi([])).toContain('none');
    expect(formatApi(['buildRail', 'camLookAt'])).toBe('  call buildRail\n  call camLookAt');
    expect(AGENT_OBSERVATION_EMPTY).toContain('snapshot.observation');
  });
});

describe('agentModeRequested', () => {
  it('opens on the link an agent is handed', () => {
    expect(agentModeRequested('?agent=1')).toBe(true);
    expect(agentModeRequested('?via=home&agent=true')).toBe(true);
    expect(agentModeRequested('?agent=0')).toBe(false);
    expect(agentModeRequested('')).toBe(false);
  });
});

describe('mergeAgentLog', () => {
  const line = (frame: number, kind: string, detail: string) => ({ frame, kind, detail });

  it('keeps sound visible when host signals would have filled the tail', () => {
    // Sound lives only in the bridge log; appending put signals last.
    const bridge = [line(28, 'sfx', 'jump'), line(29, 'music', 'theme')];
    const signals = Array.from({ length: 30 }, (_, index) => line(index, 'score', String(index)));

    const merged = mergeAgentLog(bridge, signals, 20);

    expect(merged).toHaveLength(20);
    expect(merged.filter((entry) => entry.kind === 'sfx' || entry.kind === 'music')).toEqual(bridge);
    // What drops is the oldest, not a whole stream.
    expect([...bridge, ...signals].slice(-20).some((entry) => entry.kind === 'sfx')).toBe(false);
  });

  it('interleaves by frame without reordering either stream', () => {
    const merged = mergeAgentLog(
      [line(1, 'sfx', 'a'), line(1, 'sfx', 'b'), line(5, 'sfx', 'c')],
      [line(0, 'progress', 'start'), line(3, 'score', '7')],
      20,
    );

    expect(merged.map((entry) => `${entry.frame}:${entry.detail}`)).toEqual(['0:start', '1:a', '1:b', '3:7', '5:c']);
  });
});

// A helper named `all` also occurs inside `call`.
describe('call argument parsing', () => {
  it('derives the payload past the verb, not from the first match', () => {
    expect(parseAgentCommand('call all [1]')).toEqual({ kind: 'call', name: 'all', args: [1] });
    expect(parseAgentCommand('call call {"n":2}')).toEqual({ kind: 'call', name: 'call', args: [{ n: 2 }] });
  });

  it('still reads an ordinary helper and an argumentless one', () => {
    expect(parseAgentCommand('call camLookAt [8, 12]')).toEqual({ kind: 'call', name: 'camLookAt', args: [8, 12] });
    expect(parseAgentCommand('call ping')).toEqual({ kind: 'call', name: 'ping', args: [] });
  });
});
