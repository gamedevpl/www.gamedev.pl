// @vitest-environment jsdom

// Runs the real bridge script in jsdom; nothing else executes it.

// jsdom is parent === window, so posts land back on this window.

import { describe, it, expect, afterAll, afterEach, beforeAll, beforeEach } from 'vitest';
import { AGENT_PLAY_BRIDGE } from '@gamedevpl/contract';
import { embedGameHtml } from './gamePlayer.js';

type Message = Record<string, unknown>;

const HOST = 'gdpl-host';

// The player half, as injected; the agent half arrives separately.

// Case-insensitive: a regex over tags should not care about case.
function playerBridgeSource(): string {
  const html = embedGameHtml('<html><head></head><body></body></html>');
  const match = /<script>([\s\S]*?)<\/script>/i.exec(html);
  if (!match) throw new Error('bridge script not found in the embedded document');
  return match[1]!;
}

// A published game's document, reduced to what the bridge reads.
function mountGameDocument() {
  document.body.innerHTML = `
    <div class="wrap">
      <h1 id="game-title">Cavern of Words</h1>
      <p id="game-desc">Dig for letters.</p>
      <canvas id="game" width="320" height="240"></canvas>
      <dl class="legend-keys"><dt>Arrows</dt><dd>Move</dd><dt>Space</dt><dd>Dig</dd></dl>
      <p class="hint">Reach the exit before the lamp burns out.</p>
      <p id="game-status" aria-live="polite"></p>
    </div>`;
}

type FakeHarness = {
  frame: number;
  metadata: Record<string, unknown>;
  audio: Array<Record<string, unknown>>;
  steps: number;
  step: (dt?: number, options?: { present?: boolean }) => Record<string, unknown>;
  restart: () => boolean;
  paint: () => Record<string, unknown>;
  pause: () => void;
  resume: () => void;
  screenshot: () => string;
  ui?: unknown;
  observation?: unknown;
  api?: Record<string, (...args: unknown[]) => unknown>;
  helpers?: Record<string, (...args: unknown[]) => unknown>;
  camLookAt?: (...args: unknown[]) => unknown;
};

function installHarness(): FakeHarness {
  const harness: FakeHarness = {
    frame: 0,
    metadata: { state: 'playing', score: 0, observation: '{"room":"cellar"}' },
    audio: [],
    steps: 0,
    step(_dt, _options) {
      harness.steps += 1;
      harness.frame += 1;
      harness.metadata = { ...harness.metadata, score: harness.steps };
      return harness.metadata;
    },
    restart: () => false,
    paint: () => harness.metadata,
    pause: () => undefined,
    resume: () => undefined,
    screenshot: () => '',
  };
  (window as unknown as { __GAME_HARNESS__: FakeHarness }).__GAME_HARNESS__ = harness;
  return harness;
}

// One bridge per file, so its audio cursor outlives a test.
let nextAudioSeq = 1;

function pushAudio(harness: FakeHarness, entry: Record<string, unknown>): Record<string, unknown> {
  const stamped = { source: 'gdpl-player', seq: nextAudioSeq++, ...entry };
  harness.audio.push(stamped);
  return stamped;
}

// One bridge per file: its listeners cannot be removed, so copies stack.
const received: Message[] = [];

function collectMessages(): void {
  window.addEventListener('message', (event) => {
    const data = event.data as Message | null;
    if (data && data.source === 'gdpl-player') received.push(data);
  });
}

// postMessage is a queued task, and a reply is one more.
async function settle(): Promise<void> {
  for (let turn = 0; turn < 3; turn++) await new Promise((resolve) => setTimeout(resolve, 0));
}

function send(message: Message): void {
  window.postMessage({ source: HOST, ...message }, '*');
}

function lastOf(messages: Message[], type: string): Message | undefined {
  return [...messages].reverse().find((message) => message.type === type);
}

describe('the agent bridge, running for real', () => {
  let harness: FakeHarness;

  beforeAll(() => {
    mountGameDocument();
    harness = installHarness();
    collectMessages();
    // Indirect eval on purpose: this test runs the real scripts.
    (0, eval)(playerBridgeSource());
    (0, eval)(AGENT_PLAY_BRIDGE);
  });

  // One 400ms retry is armed; let it land before jsdom goes.
  afterAll(async () => {
    await new Promise((resolve) => setTimeout(resolve, 450));
  });

  beforeEach(() => {
    received.length = 0;
    harness.steps = 0;
    harness.frame = 0;
    harness.metadata = { state: 'playing', score: 0, observation: '{"room":"cellar"}' };
    harness.audio.length = 0;
    delete harness.ui;
    delete harness.observation;
    delete harness.api;
    delete harness.helpers;
    delete harness.camLookAt;
    delete (window as unknown as { GameKit?: unknown }).GameKit;
  });

  it('reports the sound the game played, which is the only way an agent hears it', async () => {
    send({ type: 'agent:enable' });
    await settle();

    pushAudio(harness, { frame: 1, type: 'music', name: 'ocean-drift' });
    pushAudio(harness, { frame: 2, type: 'progress', label: 'round-start' });
    pushAudio(harness, { frame: 2, type: 'sfx', name: 'dig', count: 3 });
    pushAudio(harness, { frame: 3, type: 'sfx', name: 'ghost', missing: true });
    harness.frame = 60;
    send({ type: 'agent:command', command: { kind: 'look' } });
    await settle();

    const log = lastOf(received, 'agent:state')!.log as Array<{ kind: string; detail: string; frame: number }>;
    const heard = log.filter((entry) => ['sfx', 'loop', 'music'].includes(entry.kind));
    expect(heard.map((entry) => `${entry.kind}:${entry.detail}`)).toEqual([
      'music:ocean-drift',
      'sfx:dig x3',
      'sfx:ghost (missing)',
    ]);
    // The frame it happened on, not the frame the drain ran on.
    expect(heard.map((entry) => entry.frame)).toEqual([1, 2, 3]);

    // Read once, not once per state asked for.
    send({ type: 'agent:command', command: { kind: 'look' } });
    await settle();
    const again = lastOf(received, 'agent:state')!.log as Array<{ kind: string; detail: string }>;
    expect(again.filter((entry) => entry.detail === 'dig x3')).toHaveLength(1);
  });

  it('reports repeats that grow an entry a state already read', async () => {
    send({ type: 'agent:enable' });
    await settle();

    // A reported entry can still grow; its seq does not move.
    const beeps = () =>
      ((lastOf(received, 'agent:state')!.log as Array<{ detail: string }>) ?? [])
        .map((line) => line.detail)
        .filter((detail) => detail.startsWith('beep'));

    const entry = pushAudio(harness, { frame: 1, type: 'sfx', name: 'beep' });
    send({ type: 'agent:command', command: { kind: 'look' } });
    await settle();
    expect(beeps()).toEqual(['beep']);

    entry.count = 3;
    send({ type: 'agent:command', command: { kind: 'look' } });
    await settle();
    expect(beeps()).toEqual(['beep', 'beep x2']);

    // Nothing new, so nothing more is added.
    send({ type: 'agent:command', command: { kind: 'look' } });
    await settle();
    expect(beeps()).toEqual(['beep', 'beep x2']);
  });

  it('keeps hearing the game after the signal log has rotated', async () => {
    send({ type: 'agent:enable' });
    await settle();
    send({ type: 'agent:command', command: { kind: 'look' } });
    await settle();

    // At the cap, length stops moving; an index cursor goes deaf.
    const push = (name: string) => pushAudio(harness, { frame: 1, type: 'sfx', name });
    for (let turn = 0; turn < 400; turn++) push(`filler-${turn}`);
    harness.audio.splice(0, harness.audio.length - 400);
    send({ type: 'agent:command', command: { kind: 'look' } });
    await settle();

    push('after-the-rotation');
    harness.audio.splice(0, harness.audio.length - 400);
    send({ type: 'agent:command', command: { kind: 'look' } });
    await settle();

    const log = lastOf(received, 'agent:state')!.log as Array<{ detail: string }>;
    expect(log.some((entry) => entry.detail === 'after-the-rotation')).toBe(true);
  });

  it('introduces the game and its controls when the host enables agent mode', async () => {
    send({ type: 'agent:enable' });
    await settle();

    const hello = lastOf(received, 'agent:hello');
    expect(hello).toBeDefined();
    expect(hello!.title).toBe('Cavern of Words');
    expect(hello!.harness).toBe(true);
    // Hidden by chrome CSS but in the DOM: the only source.
    const controls = hello!.controls as { rows: Array<{ keys: string; action: string }>; hint: string };
    expect(controls.rows).toEqual([
      { keys: 'Arrows', action: 'Move' },
      { keys: 'Space', action: 'Dig' },
    ]);
    expect(controls.hint).toContain('lamp burns out');
  });

  it('pauses the game without the veil, so a screenshot is not dimmed', async () => {
    send({ type: 'agent:enable' });
    await settle();

    expect(document.getElementById('gdpl-pause-overlay')).toBeNull();
    const state = lastOf(received, 'agent:state');
    expect(state!.stepped).toBe(true);
  });

  it('advances time only when asked, and reports the state each command left behind', async () => {
    send({ type: 'agent:enable' });
    await settle();
    expect(harness.steps).toBe(0);

    send({ type: 'agent:command', command: { kind: 'step', frames: 5 } });
    await settle();

    expect(harness.steps).toBe(5);
    const state = lastOf(received, 'agent:state')!;
    expect(state.reason).toBe('step');
    expect(state.frame).toBe(5);
    expect((state.snapshot as Record<string, unknown>).score).toBe(5);
  });

  it('holds a key across the frames it was asked for', async () => {
    const keys: Array<{ type: string; key: string }> = [];
    window.addEventListener('keydown', (event) => keys.push({ type: 'keydown', key: event.key }));
    window.addEventListener('keyup', (event) => keys.push({ type: 'keyup', key: event.key }));

    send({ type: 'agent:enable' });
    await settle();
    send({ type: 'agent:command', command: { kind: 'press', key: 'ArrowRight', code: 'ArrowRight', frames: 3 } });
    await settle();

    // Down, three frames, up: what an input.down() reader expects.
    expect(keys).toEqual([
      { type: 'keydown', key: 'ArrowRight' },
      { type: 'keyup', key: 'ArrowRight' },
    ]);
    expect(harness.steps).toBe(3);
  });

  it("relays the game's own aria-live announcements into the log", async () => {
    send({ type: 'agent:enable' });
    await settle();

    document.getElementById('game-status')!.textContent = 'Level 2';
    await settle();
    send({ type: 'agent:command', command: { kind: 'look' } });
    await settle();

    const log = lastOf(received, 'agent:state')!.log as Array<{ kind: string; detail: string }>;
    expect(log.some((entry) => entry.kind === 'announce' && entry.detail === 'Level 2')).toBe(true);
  });

  it('says so rather than failing silently when a command cannot be honoured', async () => {
    send({ type: 'agent:enable' });
    await settle();
    send({ type: 'agent:command', command: { kind: 'restart' } });
    await settle();

    const log = lastOf(received, 'agent:state')!.log as Array<{ kind: string; detail: string }>;
    expect(log.some((entry) => entry.detail.includes('restart refused'))).toBe(true);
  });

  it('reports no hidden-field list until the document carries one', async () => {
    send({ type: 'agent:enable' });
    await settle();
    expect(lastOf(received, 'agent:state')!.hiddenFields).toBeNull();

    (window as unknown as { __GAME_AGENT_HIDDEN__?: string[] }).__GAME_AGENT_HIDDEN__ = ['targetWord'];
    send({ type: 'agent:command', command: { kind: 'look' } });
    await settle();
    expect(lastOf(received, 'agent:state')!.hiddenFields).toEqual(['targetWord']);
    delete (window as unknown as { __GAME_AGENT_HIDDEN__?: string[] }).__GAME_AGENT_HIDDEN__;
  });

  it('hands time back on live, so a human can take over', async () => {
    send({ type: 'agent:enable' });
    await settle();
    send({ type: 'agent:command', command: { kind: 'live' } });
    await settle();

    expect(lastOf(received, 'agent:state')!.stepped).toBe(false);
  });

  it('is absent from a document the API did not serve it into', () => {
    const plain = embedGameHtml('<html><head></head><body></body></html>');
    expect(plain).not.toContain('agent:state');
    expect(plain).toContain('__GDPL_BRIDGE__');

    const served = embedGameHtml('<html><head></head><body></body></html>', AGENT_PLAY_BRIDGE);
    expect(served).toContain('agent:state');
  });

  // A policy is the reason this surface exists: a plan cannot branch.
  async function runPolicy(code: string, budget = 200): Promise<Message> {
    send({ type: 'agent:enable' });
    await settle();
    send({ type: 'agent:policy', code, budget });
    await settle();
    const result = lastOf(received, 'agent:policy-result');
    if (!result) throw new Error('the policy never answered');
    return result;
  }

  it('runs a policy and brings back what it logged', async () => {
    const result = await runPolicy(`function playAgent(agent) {
      agent.log('starting at', agent.frame());
      agent.step(4);
      agent.log('now at', agent.frame());
    }`);

    expect(result.outcome).toBe('completed');
    expect(result.frames).toBe(4);
    const logs = result.logs as Array<{ text: string }>;
    expect(logs[0]!.text).toContain('starting at');
    expect(logs[1]!.text).toContain('now at 4');
  });

  it('captures console.log from inside the frame, which the host cannot see', async () => {
    const result = await runPolicy(`function playAgent(agent) { console.log('from console', 42); }`);
    const logs = result.logs as Array<{ text: string }>;
    expect(logs.some((line) => line.text.includes('from console 42'))).toBe(true);
  });

  it('keeps a named series, so a reviewer sees a trajectory and not a snapshot', async () => {
    const result = await runPolicy(`function playAgent(agent) {
      for (let i = 0; i < 3; i++) { agent.step(2); agent.watch('score', agent.state().score); }
    }`);

    const watches = result.watches as Array<{ name: string; value: unknown }>;
    expect(watches).toHaveLength(3);
    expect(watches.every((point) => point.name === 'score')).toBe(true);
    expect(watches.map((point) => point.value)).toEqual([2, 4, 6]);
  });

  it('reports a policy that threw, with the message and where it was', async () => {
    const result = await runPolicy(
      `function playAgent(agent) { agent.step(1); throw new Error('no idea what to do'); }`,
    );

    expect(result.outcome).toBe('failed');
    expect(String(result.message)).toContain('no idea what to do');
    // The frames it did spend before breaking are still reported.
    expect(result.frames).toBe(1);
  });

  it('stops a policy that would step forever', async () => {
    const result = await runPolicy(`function playAgent(agent) { for (;;) agent.step(1); }`, 25);

    expect(result.outcome).toBe('failed');
    expect(String(result.message)).toContain('budget of 25 frames');
    expect(result.frames).toBeGreaterThanOrEqual(25);
  });

  it('takes the API back off the window when the run ends', async () => {
    await runPolicy(`function playAgent(agent) { agent.log('hi'); }`);
    expect((window as unknown as { __AGENT__?: unknown }).__AGENT__).toBeUndefined();
  });

  it('ignores a policy message whose payload tried to pose as the sender', async () => {
    // The envelope owns `source`; the payload field is `code`.
    send({ type: 'agent:enable' });
    await settle();
    received.length = 0;
    send({ type: 'agent:policy', source: 'function playAgent(a) { a.log("nope"); }' });
    await settle();
    expect(lastOf(received, 'agent:policy-result')).toBeUndefined();
  });

  it('redacts a hidden answer before it ever leaves the frame', async () => {
    (window as unknown as { __GAME_AGENT_HIDDEN__?: string[] }).__GAME_AGENT_HIDDEN__ = ['observation'];
    send({ type: 'agent:enable' });
    await settle();
    send({ type: 'agent:command', command: { kind: 'look' } });
    await settle();

    const state = lastOf(received, 'agent:state')!;
    // Host-side redaction would already have put it on the wire.
    expect(state.snapshot as Record<string, unknown>).not.toHaveProperty('observation');
    expect(JSON.stringify(state)).not.toContain('cellar');
    delete (window as unknown as { __GAME_AGENT_HIDDEN__?: string[] }).__GAME_AGENT_HIDDEN__;
  });

  it('answers each command with its own id, so a screenshot cannot answer twice', async () => {
    send({ type: 'agent:enable' });
    await settle();
    received.length = 0;
    send({ type: 'agent:command', id: 41, command: { kind: 'screenshot' } });
    await settle();

    const shot = lastOf(received, 'agent:shot')!;
    const state = lastOf(received, 'agent:state')!;
    // Both replies belong to the screenshot and say so.
    expect(shot.id).toBe(41);
    expect(state.id).toBe(41);
  });

  it('releases a key it is still holding when the mode closes', async () => {
    const keys: Array<{ type: string; key: string }> = [];
    const listener = (event: KeyboardEvent) => keys.push({ type: event.type, key: event.key });
    window.addEventListener('keyup', listener);

    send({ type: 'agent:enable' });
    await settle();
    send({ type: 'agent:command', command: { kind: 'keyDown', key: 'ArrowRight', code: 'ArrowRight' } });
    await settle();
    keys.length = 0;
    send({ type: 'agent:disable' });
    await settle();

    // Otherwise the human taking over inherits a stuck key.
    expect(keys).toEqual([{ type: 'keyup', key: 'ArrowRight' }]);
    window.removeEventListener('keyup', listener);
  });

  it('releases held input when a policy ends, however it ended', async () => {
    const keys: string[] = [];
    const listener = (event: KeyboardEvent) => keys.push(`${event.type}:${event.key}`);
    window.addEventListener('keyup', listener);

    send({ type: 'agent:enable' });
    await settle();
    keys.length = 0;
    send({
      type: 'agent:policy',
      code: 'function playAgent(a){ a.down("ArrowLeft"); throw new Error("gave up"); }',
      budget: 50,
    });
    await settle();

    expect(keys).toContain('keyup:ArrowLeft');
    window.removeEventListener('keyup', listener);
  });

  it('ignores agent traffic that did not come from the host', async () => {
    window.postMessage({ source: 'gdpl-player', type: 'agent:enable' }, '*');
    await settle();
    expect(lastOf(received, 'agent:hello')).toBeUndefined();
  });

  it('merges GameKit widgets with harness.ui so a toolbar without the ui module is visible', async () => {
    (window as unknown as { GameKit: { ui: { affordances: () => unknown[] } } }).GameKit = {
      ui: {
        affordances: () => [{ label: 'Score', enabled: true, x1: 0, y1: 0, x2: 0.2, y2: 0.1 }],
      },
    };
    harness.ui = [{ label: 'Rail', enabled: true, selected: true, x: 0, y: 216, width: 48, height: 24 }];
    send({ type: 'agent:enable' });
    await settle();
    send({ type: 'agent:command', command: { kind: 'look' } });
    await settle();

    const ui = lastOf(received, 'agent:state')!.ui as Array<{ label: string; x1: number; selected?: boolean }>;
    expect(ui.map((widget) => widget.label)).toEqual(['Score', 'Rail']);
    expect(ui[1]?.selected).toBe(true);
  });

  it('fills observation from the harness when snapshot omitted it', async () => {
    harness.metadata = { state: 'playing', cash: 12000 };
    harness.observation = () => ({ tool: 'rail', cam: [8, 12] });
    send({ type: 'agent:enable' });
    await settle();
    send({ type: 'agent:command', command: { kind: 'look' } });
    await settle();

    const snapshot = lastOf(received, 'agent:state')!.snapshot as Record<string, unknown>;
    expect(snapshot.observation).toContain('"tool":"rail"');
    expect(snapshot.cash).toBe(12000);
  });

  it('lists helpers from harness.api and Object.assign, and policy can call them', async () => {
    let looked = 0;
    harness.api = { buildRail: (from: unknown, to: unknown) => ({ from, to }) };
    harness.camLookAt = (x: unknown, y: unknown) => {
      looked += 1;
      return { x, y };
    };
    send({ type: 'agent:enable' });
    await settle();
    send({ type: 'agent:command', command: { kind: 'look' } });
    await settle();
    expect(lastOf(received, 'agent:state')!.api).toEqual(['buildRail', 'camLookAt']);

    const result = await runPolicy(`function playAgent(agent) {
      agent.log(agent.api().join(','));
      const built = agent.call('buildRail', [0, 0], [1, 1]);
      agent.log(JSON.stringify(built));
      agent.call('camLookAt', 8, 12);
    }`);
    expect(result.outcome).toBe('completed');
    const logs = result.logs as Array<{ text: string }>;
    expect(logs.some((entry) => entry.text.includes('buildRail,camLookAt'))).toBe(true);
    expect(logs.some((entry) => entry.text.includes('"from":[0,0]'))).toBe(true);
    expect(looked).toBe(1);

    received.length = 0;
    send({ type: 'agent:command', command: { kind: 'call', name: 'camLookAt', args: [3, 4] } });
    await settle();
    const log = lastOf(received, 'agent:state')!.log as Array<{ kind: string; detail: string }>;
    expect(log.some((entry) => entry.kind === 'call' && entry.detail.includes('camLookAt'))).toBe(true);
    expect(looked).toBe(2);
  });

  // An ordinary table let call reach Object.prototype and report success.
  it('refuses a prototype name no game registered', async () => {
    harness.api = { realOne: () => 'ok' };
    send({ type: 'agent:enable' });
    await settle();

    const result = await runPolicy(`function playAgent(agent) {
      for (const name of ['constructor', 'toString', 'valueOf', 'hasOwnProperty']) {
        try { agent.call(name); agent.log('RESOLVED ' + name); }
        catch (err) { agent.log('refused ' + name); }
      }
      agent.log('real ' + agent.call('realOne'));
    }`);
    expect(result.outcome).toBe('completed');
    const logs = (result.logs as Array<{ text: string }>).map((entry) => entry.text);
    expect(logs.some((text) => text.startsWith('RESOLVED'))).toBe(false);
    expect(logs.filter((text) => text.startsWith('refused'))).toHaveLength(4);
    expect(logs).toContain('real ok');
  });

  // A truncated name was advertised but could not be called.
  it('only lists helper names that call can resolve', async () => {
    const longName = 'buildRailFromTheDepotAllTheWayToTheHarbourSide';
    harness.api = { [longName]: () => 'ok', shortOne: () => 'ok' };
    send({ type: 'agent:enable' });
    await settle();
    send({ type: 'agent:command', command: { kind: 'look' } });
    await settle();

    const api = lastOf(received, 'agent:state')!.api as string[];
    expect(api).toContain('shortOne');
    expect(api.some((name) => longName.startsWith(name) && name !== longName)).toBe(false);
  });

  // A registry of junk was scanned whole, every frame, to publish nothing.
  it('bounds the scan over a large helper registry', async () => {
    const junk: Record<string, (...args: unknown[]) => unknown> = {};
    for (let i = 0; i < 5000; i++) junk[`junk${i}`] = i as unknown as () => unknown;
    junk.lateHelper = () => 'ok';
    harness.api = junk;
    const started = Date.now();
    send({ type: 'agent:enable' });
    await settle();
    send({ type: 'agent:command', command: { kind: 'look' } });
    await settle();

    const api = lastOf(received, 'agent:state')!.api as string[];
    expect(api).not.toContain('lateHelper');
    expect(Date.now() - started).toBeLessThan(1000);
  });

  // One bad registration must not take the whole surface down.
  it('skips a helper registration whose getter throws', async () => {
    const api: Record<string, unknown> = { good: () => 'ok' };
    Object.defineProperty(api, 'landmine', {
      enumerable: true,
      get() {
        throw new Error('no');
      },
    });
    harness.api = api as Record<string, (...args: unknown[]) => unknown>;
    send({ type: 'agent:enable' });
    await settle();
    send({ type: 'agent:command', command: { kind: 'look' } });
    await settle();

    const state = lastOf(received, 'agent:state')!;
    expect(state.api as string[]).toContain('good');
    expect(state.api as string[]).not.toContain('landmine');
  });

  // A method registered on the registry must still see its own object.
  it('calls a helper with the registry it was registered on', async () => {
    harness.api = {
      total: 0,
      increment(this: { total: number }) {
        this.total += 1;
        return this.total;
      },
    } as unknown as Record<string, (...args: unknown[]) => unknown>;
    send({ type: 'agent:enable' });
    await settle();
    send({ type: 'agent:command', command: { kind: 'call', name: 'increment', args: [] } });
    await settle();

    const log = lastOf(received, 'agent:state')!.log as Array<{ kind: string; detail: string }>;
    expect(log.some((entry) => entry.kind === 'error')).toBe(false);
    expect(log.some((entry) => entry.detail === 'increment 1')).toBe(true);
  });

  // A helper registered during a call is callable in that frame.
  it('sees a registry change made inside one frame', async () => {
    const api: Record<string, (...args: unknown[]) => unknown> = {
      openGate: () => {
        api.walkThrough = () => 'through';
        return 'open';
      },
    };
    harness.api = api;
    send({ type: 'agent:enable' });
    await settle();
    send({ type: 'agent:command', command: { kind: 'call', name: 'openGate', args: [] } });
    await settle();

    expect(lastOf(received, 'agent:state')!.api as string[]).toContain('walkThrough');
  });

  // A registration written as a method must still see its harness.
  it('reads a functional observation with its owner as receiver', async () => {
    harness.metadata = { state: 'playing', cash: 12 };
    harness.observation = function (this: { metadata: { cash: number } }) {
      return { cash: this.metadata.cash };
    };
    send({ type: 'agent:enable' });
    await settle();
    send({ type: 'agent:command', command: { kind: 'look' } });
    await settle();

    const snapshot = lastOf(received, 'agent:state')!.snapshot as Record<string, unknown>;
    expect(snapshot.observation).toContain('"cash":12');
  });

  // A hidden key one level down used to reach the agent.
  describe('hiddenFields reach the structured surfaces too', () => {
    const setHidden = (names: string[] | null) => {
      const scope = window as unknown as { __GAME_AGENT_HIDDEN__?: string[] };
      if (names) scope.__GAME_AGENT_HIDDEN__ = names;
      else delete scope.__GAME_AGENT_HIDDEN__;
    };

    afterEach(() => setHidden(null));

    it('drops a hidden key nested inside observation', async () => {
      setHidden(['targetWord']);
      harness.metadata = { state: 'playing' };
      harness.observation = () => ({ room: 'cellar', clue: { targetWord: 'RAVEN', letters: 5 } });
      send({ type: 'agent:enable' });
      await settle();
      send({ type: 'agent:command', command: { kind: 'look' } });
      await settle();

      const snapshot = lastOf(received, 'agent:state')!.snapshot as Record<string, unknown>;
      expect(snapshot.observation).not.toContain('RAVEN');
      // Redaction, not deletion: what is not hidden still reaches the agent.
      expect(snapshot.observation).toContain('"room":"cellar"');
      expect(snapshot.observation).toContain('"letters":5');
    });

    it("keeps a helper's hidden return value out of the log that crosses the bridge", async () => {
      setHidden(['targetWord']);
      harness.api = { peekRound: () => ({ cash: 100, targetWord: 'RAVEN' }) };
      send({ type: 'agent:enable' });
      await settle();
      received.length = 0;
      send({ type: 'agent:command', command: { kind: 'call', name: 'peekRound', args: [] } });
      await settle();

      const log = lastOf(received, 'agent:state')!.log as Array<{ kind: string; detail: string }>;
      // One bridge serves the file, so its log outlives a test.
      const note = log.find((entry) => entry.kind === 'call' && entry.detail.startsWith('peekRound'));
      expect(note?.detail).toContain('"cash":100');
      expect(note?.detail).not.toContain('RAVEN');
    });

    // A policy reads the harness directly; redacting here is theatre.
    it('still hands the policy the unredacted value', async () => {
      setHidden(['targetWord']);
      harness.api = { peekRound: () => ({ cash: 100, targetWord: 'RAVEN' }) };
      send({ type: 'agent:enable' });
      await settle();

      const result = await runPolicy(`function playAgent(agent) {
        agent.log(JSON.stringify(agent.call('peekRound')));
      }`);
      expect(result.outcome).toBe('completed');
      const logs = result.logs as Array<{ text: string }>;
      expect(logs.some((entry) => entry.text.includes('RAVEN'))).toBe(true);
    });

    // The parse cap guards strings; an object graph never met it.
    it('withholds an object observation too large to serialize', async () => {
      setHidden(['targetWord']);
      harness.metadata = { state: 'playing' };
      harness.observation = () => ({ room: 'cellar', pad: 'x'.repeat(2_000_000) });
      send({ type: 'agent:enable' });
      await settle();
      send({ type: 'agent:command', command: { kind: 'look' } });
      await settle();

      const snapshot = lastOf(received, 'agent:state')!.snapshot as Record<string, unknown>;
      expect(snapshot.observation).toContain('too large');
      expect(String(snapshot.observation).length).toBeLessThan(200);
    });

    it('still serializes an ordinary object observation in full', async () => {
      setHidden(['targetWord']);
      harness.metadata = { state: 'playing' };
      harness.observation = () => ({ room: 'cellar', tool: 'rail' });
      send({ type: 'agent:enable' });
      await settle();
      send({ type: 'agent:command', command: { kind: 'look' } });
      await settle();

      const snapshot = lastOf(received, 'agent:state')!.snapshot as Record<string, unknown>;
      expect(snapshot.observation).toContain('"room":"cellar"');
      expect(snapshot.observation).toContain('"tool":"rail"');
    });

    // The walk clones, so it needs its own bound too.
    it('withholds an observation too wide to walk', async () => {
      setHidden(['targetWord']);
      harness.metadata = { state: 'playing' };
      harness.observation = () => ({ rows: Array.from({ length: 500_000 }, (_, i) => i) });
      send({ type: 'agent:enable' });
      await settle();
      send({ type: 'agent:command', command: { kind: 'look' } });
      await settle();

      const snapshot = lastOf(received, 'agent:state')!.snapshot as Record<string, unknown>;
      expect(snapshot.observation).toContain('too large');
    });

    it('still walks ordinary nested data', async () => {
      setHidden(['targetWord']);
      harness.metadata = { state: 'playing' };
      harness.observation = () => ({ grid: [[1, 2]], camera: { x: 4 }, targetWord: 'RAVEN' });
      send({ type: 'agent:enable' });
      await settle();
      send({ type: 'agent:command', command: { kind: 'look' } });
      await settle();

      const snapshot = lastOf(received, 'agent:state')!.snapshot as Record<string, unknown>;
      expect(snapshot.observation).toContain('"grid":[[1,2]]');
      expect(snapshot.observation).toContain('"x":4');
      expect(snapshot.observation).not.toContain('RAVEN');
    });

    // Text a game formats itself is text: capped, never parsed, never inspected.
    it('passes a JSON-shaped string through without parsing it', async () => {
      setHidden(['targetWord']);
      const json = JSON.stringify({ room: 'cellar', targetWord: 'RAVEN' });
      harness.metadata = { state: 'playing', observation: json };
      send({ type: 'agent:enable' });
      await settle();
      send({ type: 'agent:command', command: { kind: 'look' } });
      await settle();

      const snapshot = lastOf(received, 'agent:state')!.snapshot as Record<string, unknown>;
      expect(snapshot.observation).toBe(json);
    });

    // A helper that throws could carry the answer in its message.
    it('reports a helper failure without its message when fields are declared', async () => {
      setHidden(['targetWord']);
      harness.api = {
        boom: () => {
          throw new Error(JSON.stringify({ targetWord: 'RAVEN' }));
        },
      };
      send({ type: 'agent:enable' });
      await settle();
      received.length = 0;
      send({ type: 'agent:command', command: { kind: 'call', name: 'boom', args: [] } });
      await settle();

      const log = lastOf(received, 'agent:state')!.log as Array<{ kind: string; detail: string }>;
      const note = log.find((entry) => entry.kind === 'error' && entry.detail.startsWith('boom'));
      expect(note?.detail).toContain('helper failed');
      expect(note?.detail).not.toContain('RAVEN');
    });

    it('withholds a structured value too large to serialize', async () => {
      setHidden(['targetWord']);
      harness.metadata = { state: 'playing' };
      harness.observation = () => ({ pad: 'x'.repeat(2_000_000), targetWord: 'RAVEN' });
      send({ type: 'agent:enable' });
      await settle();
      send({ type: 'agent:command', command: { kind: 'look' } });
      await settle();

      const snapshot = lastOf(received, 'agent:state')!.snapshot as Record<string, unknown>;
      expect(snapshot.observation).toContain('too large');
      expect(snapshot.observation).not.toContain('RAVEN');
    });

    // A long key outran the counter and the result was sliced.
    it('withholds rather than emitting a truncated document', async () => {
      setHidden(['targetWord']);
      harness.metadata = { state: 'playing' };
      harness.observation = () => ({ ['k'.repeat(50000)]: 1 });
      send({ type: 'agent:enable' });
      await settle();
      send({ type: 'agent:command', command: { kind: 'look' } });
      await settle();

      const snapshot = lastOf(received, 'agent:state')!.snapshot as Record<string, unknown>;
      const observation = String(snapshot.observation ?? '');
      expect(observation).toContain('too large');
      // The marker, never a cut JSON prefix.
      expect(observation.startsWith('{')).toBe(false);
    });

    // Rejected entries still cost a look, so bound the scan.
    it('bounds the widget scan, not only what it accepts', async () => {
      harness.ui = { length: 100_000_000 } as unknown as never;
      send({ type: 'agent:enable' });
      await settle();
      const started = Date.now();
      send({ type: 'agent:command', command: { kind: 'look' } });
      await settle();

      expect(lastOf(received, 'agent:state')!.ui).toEqual([]);
      expect(Date.now() - started).toBeLessThan(1000);
    });

    // A getter answering differently twice used to slip its second answer past.
    it('reads each snapshot property once', async () => {
      setHidden(['targetWord']);
      let reads = 0;
      const meta: Record<string, unknown> = { state: 'playing' };
      Object.defineProperty(meta, 'clue', {
        enumerable: true,
        get() {
          reads += 1;
          return reads > 1 ? { targetWord: 'RAVEN' } : null;
        },
      });
      harness.metadata = meta;
      send({ type: 'agent:enable' });
      await settle();
      send({ type: 'agent:command', command: { kind: 'look' } });
      await settle();

      const snapshot = lastOf(received, 'agent:state')!.snapshot as Record<string, unknown>;
      expect(JSON.stringify(snapshot)).not.toContain('RAVEN');
    });

    // A giant key was escaped whole before the budget could refuse it.
    it('withholds an oversized key without escaping all of it', async () => {
      setHidden(['targetWord']);
      harness.metadata = { state: 'playing' };
      const wide: Record<string, unknown> = {};
      wide['k'.repeat(2_000_000)] = 1;
      harness.observation = () => wide;
      const started = Date.now();
      send({ type: 'agent:enable' });
      await settle();
      send({ type: 'agent:command', command: { kind: 'look' } });
      await settle();

      const snapshot = lastOf(received, 'agent:state')!.snapshot as Record<string, unknown>;
      expect(snapshot.observation).toContain('too large');
      expect(Date.now() - started).toBeLessThan(2000);
    });

    // An accessor is game code, and this walk runs none.
    it('does not run an accessor while fields are declared', async () => {
      setHidden(['targetWord']);
      harness.metadata = { state: 'playing' };
      const clue: Record<string, unknown> = { targetWord: 'RAVEN', letters: 5 };
      Object.defineProperty(clue, 'answer', {
        enumerable: true,
        get() {
          return clue.targetWord;
        },
      });
      harness.observation = () => ({ clue });
      send({ type: 'agent:enable' });
      await settle();
      send({ type: 'agent:command', command: { kind: 'look' } });
      await settle();

      const snapshot = lastOf(received, 'agent:state')!.snapshot as Record<string, unknown>;
      expect(snapshot.observation).toContain('"letters":5');
      expect(snapshot.observation).not.toContain('RAVEN');
    });

    // Each converter here runs before any check could see it.
    it('never lets a toJSON carry a declared key out', async () => {
      const shapes: Record<string, () => unknown> = {
        renames: () => ({ targetWord: 'RAVEN', toJSON: () => ({ answer: 'RAVEN' }) }),
        erasesItself: () => ({
          targetWord: 'RAVEN',
          toJSON(this: Record<string, unknown>) {
            delete this.toJSON;
            return { answer: this.targetWord };
          },
        }),
        returnsPrimitive: () => ({
          targetWord: 'RAVEN',
          toJSON(this: Record<string, unknown>) {
            return this.targetWord;
          },
        }),
        renamesInPlace: () => ({
          targetWord: 'RAVEN',
          toJSON(this: Record<string, unknown>) {
            this.answer = this.targetWord;
            delete this.targetWord;
            return this;
          },
        }),
      };

      for (const [name, make] of Object.entries(shapes)) {
        setHidden(['targetWord']);
        harness.metadata = { state: 'playing' };
        harness.observation = () => ({ clue: make() });
        send({ type: 'agent:enable' });
        await settle();
        send({ type: 'agent:command', command: { kind: 'look' } });
        await settle();

        const snapshot = lastOf(received, 'agent:state')!.snapshot as Record<string, unknown>;
        expect(String(snapshot.observation), name).not.toContain('RAVEN');
      }
    });

    // A game toJSON is never consulted, so nobody borrows the Date path.
    it('reads a date-like object as the object it is', async () => {
      setHidden(['targetWord']);
      harness.metadata = { state: 'playing' };
      const alien = { stamp: 0, toJSON: () => 'borrowed' };
      harness.observation = () => ({ when: alien, ok: 1 });
      send({ type: 'agent:enable' });
      await settle();
      send({ type: 'agent:command', command: { kind: 'look' } });
      await settle();

      const snapshot = lastOf(received, 'agent:state')!.snapshot as Record<string, unknown>;
      expect(snapshot.observation).toContain('"stamp":0');
      expect(snapshot.observation).not.toContain('borrowed');
    });

    // A Date cannot rename anything, so it still serializes.
    it('still serializes a Date', async () => {
      setHidden(['targetWord']);
      harness.metadata = { state: 'playing' };
      harness.observation = () => ({ when: new Date(0), ok: 1 });
      send({ type: 'agent:enable' });
      await settle();
      send({ type: 'agent:command', command: { kind: 'look' } });
      await settle();

      const snapshot = lastOf(received, 'agent:state')!.snapshot as Record<string, unknown>;
      expect(snapshot.observation).toContain('1970-01-01');
    });

    it('leaves a game that declares nothing untouched', async () => {
      setHidden(null);
      harness.metadata = { state: 'playing' };
      harness.observation = () => ({ room: 'cellar', clue: { targetWord: 'RAVEN' } });
      send({ type: 'agent:enable' });
      await settle();
      send({ type: 'agent:command', command: { kind: 'look' } });
      await settle();

      const snapshot = lastOf(received, 'agent:state')!.snapshot as Record<string, unknown>;
      expect(snapshot.observation).toContain('RAVEN');
    });
  });
});
