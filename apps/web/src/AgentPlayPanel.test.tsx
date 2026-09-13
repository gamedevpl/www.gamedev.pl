// @vitest-environment jsdom

// What the panel sends into the frame, and what it renders back.

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import i18n from './i18n/index.js';
import { AgentPlayPanel } from './AgentPlayPanel.js';

type Posted = Record<string, unknown>;

let container: HTMLDivElement;
let root: Root | null = null;
let posted: Posted[];
let frameRef: { current: HTMLIFrameElement | null };

// Stands in for the sandboxed game frame.
function fakeFrame(): HTMLIFrameElement {
  posted = [];
  return {
    contentWindow: {
      postMessage: (message: Posted) => posted.push(message),
    },
  } as unknown as HTMLIFrameElement;
}

// A message shaped like one the bridge would post back.
async function receive(message: Posted): Promise<void> {
  await act(async () => {
    window.dispatchEvent(new MessageEvent('message', { data: { source: 'gdpl-player', ...message }, origin: 'null' }));
  });
}

function typeAndRun(text: string): Promise<void> {
  const input = container.querySelector('.agent-play-command-input') as HTMLTextAreaElement;
  const run = container.querySelector('.agent-play-run') as HTMLButtonElement;
  return act(async () => {
    // Native setter, so React's tracked value changes and onChange fires.
    const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')!.set!;
    setter.call(input, text);
    input.dispatchEvent(new Event('input', { bubbles: true }));
    run.click();
  });
}

beforeEach(async () => {
  (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  await i18n.changeLanguage('en');
  vi.useFakeTimers();
  container = document.createElement('div');
  document.body.appendChild(container);
  frameRef = { current: fakeFrame() };
  root = createRoot(container);
  await act(async () => {
    root!.render(<AgentPlayPanel open frameRef={frameRef} onClose={() => undefined} />);
  });
});

afterEach(async () => {
  await act(async () => root?.unmount());
  root = null;
  container.remove();
  vi.useRealTimers();
});

describe('AgentPlayPanel', () => {
  it('turns the mode on in the frame as soon as it opens', () => {
    expect(posted[0]).toMatchObject({ source: 'gdpl-host', type: 'agent:enable' });
  });

  it('renders the state as one sorted line an agent can parse', async () => {
    await receive({
      type: 'agent:state',
      reason: 'step',
      frame: 7,
      snapshot: { score: 3, state: 'playing' },
      stepped: true,
    });

    expect(container.textContent).toContain('frame=7 score=3 state="playing"');
    expect(container.textContent).toContain('frame 7 · paused (stepped)');
  });

  it("gives the game's own description of the screen its own block", async () => {
    await receive({
      type: 'agent:state',
      frame: 1,
      snapshot: { state: 'playing', observation: '{"exit":"north"}' },
      ui: [{ label: 'Restart', enabled: true, x1: 0, y1: 0, x2: 0.2, y2: 0.1 }],
    });

    expect(container.textContent).toContain('"exit": "north"');
    expect(container.textContent).toContain('[Restart] click 0.10 0.05');
    // The observation never joins the one-line state.
    expect(container.textContent).not.toContain('observation=');
  });

  it('warns when the document declares no hidden fields, so the gap is visible', async () => {
    await receive({ type: 'agent:state', frame: 1, snapshot: { state: 'playing' }, hiddenFields: null });
    expect(container.textContent).toContain('hiddenFields: none declared');

    await receive({ type: 'agent:state', frame: 2, snapshot: { state: 'playing' }, hiddenFields: ['targetWord'] });
    expect(container.textContent).not.toContain('hiddenFields: none declared');
  });

  it('sends a parsed command into the frame', async () => {
    await typeAndRun('press right 12');

    const command = posted.find((message) => message.type === 'agent:command');
    expect(command).toMatchObject({
      source: 'gdpl-host',
      command: { kind: 'press', key: 'ArrowRight', code: 'ArrowRight', frames: 12 },
    });
  });

  it('answers a bad command instead of doing nothing', async () => {
    await typeAndRun('teleport 3');

    expect(posted.some((message) => message.type === 'agent:command')).toBe(false);
    expect(container.textContent).toContain('unknown command');
  });

  it("folds the game's own play signals into the log", async () => {
    await receive({ type: 'progress', label: 'room-2', frame: 40 });
    await receive({ type: 'end', outcome: 'lost', frame: 61 });

    expect(container.textContent).toContain('f40 progress: room-2');
    expect(container.textContent).toContain('f61 end: lost');
  });

  it('turns the mode off in the frame when it closes', async () => {
    await act(async () => {
      root!.render(<AgentPlayPanel open={false} frameRef={frameRef} onClose={() => undefined} />);
    });
    expect(posted.some((message) => message.type === 'agent:disable')).toBe(true);
  });
});
