// @vitest-environment jsdom

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import i18n from './i18n/index.js';

vi.mock('./AuthContext', () => ({
  useAuth: () => ({ user: null, signInWithGoogleToken: vi.fn(), logout: vi.fn() }),
}));

vi.mock('./votesApi', () => ({
  fetchVotes: vi.fn().mockResolvedValue({ up: 0, down: 0, mine: null }),
  castVote: vi.fn(),
  clearVote: vi.fn(),
}));

vi.mock('./gamePlayer', async () => {
  const actual = await vi.importActual<typeof import('./gamePlayer')>('./gamePlayer');
  return {
    ...actual,
    useGameTelemetry: () => undefined,
  };
});

vi.mock('./PublishedGameFrame', () => ({
  PublishedGameFrame: ({ frameRef }: { frameRef?: { current: HTMLIFrameElement | null } }) => (
    <iframe className="game-frame" title="game" ref={frameRef as React.Ref<HTMLIFrameElement>} />
  ),
}));

vi.mock('./useScreenWakeLock', () => ({
  useScreenWakeLock: () => undefined,
}));

const agentBridgeMock = vi.hoisted(() => ({
  source: null as string | null | undefined,
}));
vi.mock('./useAgentBridge', () => ({
  useAgentBridge: () => agentBridgeMock.source,
}));

import { GameTheater } from './GameTheater.js';

let container: HTMLDivElement;
let root: Root | null = null;

beforeEach(async () => {
  (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  await i18n.changeLanguage('en');
  container = document.createElement('div');
  document.body.appendChild(container);
});

afterEach(() => {
  act(() => {
    root?.unmount();
  });
  root = null;
  container.remove();
  agentBridgeMock.source = null;
  window.history.pushState(null, '', '/');
});

async function draw() {
  root = createRoot(container);
  await act(async () => {
    root!.render(
      <GameTheater
        title="Brick Storm"
        badge={{ icon: 'sparkle', label: 'AI' }}
        source={{ slug: 'brick-storm' }}
        reportSlug="brick-storm"
        onExit={() => undefined}
      />,
    );
  });
  await act(async () => {
    await Promise.resolve();
  });
}

describe('GameTheater agent mode panel', () => {
  it('applies has-agent-panel class when agent mode is open', async () => {
    agentBridgeMock.source = 'console.log("bridge");';
    window.history.pushState(null, '', '?agent=1');
    await draw();
    const stage = container.querySelector('.stage') as HTMLElement;
    expect(stage.classList.contains('has-agent-panel')).toBe(true);
    expect(container.querySelector('.agent-play')).not.toBeNull();
  });

  it('omits has-agent-panel class when agent mode is not open', async () => {
    agentBridgeMock.source = null;
    window.history.pushState(null, '', '/play/brick-storm');
    await draw();
    const stage = container.querySelector('.stage') as HTMLElement;
    expect(stage.classList.contains('has-agent-panel')).toBe(false);
    expect(container.querySelector('.agent-play')).toBeNull();
  });
});
