// @vitest-environment jsdom

// Runs the real bridge script in jsdom; nothing else executes it.

// jsdom is parent === window, so posts land back on this window.

import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
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
  steps: number;
  step: (dt?: number, options?: { present?: boolean }) => Record<string, unknown>;
  restart: () => boolean;
  paint: () => Record<string, unknown>;
  pause: () => void;
  resume: () => void;
  screenshot: () => string;
};

function installHarness(): FakeHarness {
  const harness: FakeHarness = {
    frame: 0,
    metadata: { state: 'playing', score: 0, observation: '{"room":"cellar"}' },
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

  beforeEach(() => {
    received.length = 0;
    harness.steps = 0;
    harness.frame = 0;
    harness.metadata = { state: 'playing', score: 0, observation: '{"room":"cellar"}' };
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

  it('ignores agent traffic that did not come from the host', async () => {
    window.postMessage({ source: 'gdpl-player', type: 'agent:enable' }, '*');
    await settle();
    expect(lastOf(received, 'agent:hello')).toBeUndefined();
  });
});
