// @vitest-environment jsdom

// Runs the real bridge script in jsdom; nothing else executes it.

// jsdom is parent === window, so posts land back on this window.

import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
import { AGENT_PLAY_BRIDGE } from '@gamedevpl/contract';
import { embedGameHtml } from './gamePlayer.js';

type Message = Record<string, unknown>;

const HOST = 'gdpl-host';

// The player half, as injected; the agent half arrives separately.
function playerBridgeSource(): string {
  const html = embedGameHtml('<html><head></head><body></body></html>');
  const match = /<script>([\s\S]*?)<\/script>/.exec(html);
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

  it('ignores agent traffic that did not come from the host', async () => {
    window.postMessage({ source: 'gdpl-player', type: 'agent:enable' }, '*');
    await settle();
    expect(lastOf(received, 'agent:hello')).toBeUndefined();
  });
});
