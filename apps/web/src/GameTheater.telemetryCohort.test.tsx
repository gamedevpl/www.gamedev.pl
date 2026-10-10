// @vitest-environment jsdom

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
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
  PublishedGameFrame: ({
    frameRef,
    agentMode,
  }: {
    frameRef?: { current: HTMLIFrameElement | null };
    agentMode?: boolean;
  }) => (
    <iframe
      data-agent={String(agentMode)}
      className="game-frame"
      title="game"
      ref={frameRef as React.Ref<HTMLIFrameElement>}
    />
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
  window.sessionStorage.clear();
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

it('collects ordinary reviewer play while identifying active agent sessions', async () => {
  agentBridgeMock.source = 'diagnostic-bridge';
  await draw();
  expect(container.querySelector('iframe')?.getAttribute('data-agent')).toBe('false');
  expect(container.querySelector('.agent-play')).toBeNull();
  await act(async () => root?.unmount());
  root = null;
  window.history.pushState(null, '', '?agent=1');
  await draw();
  expect(container.querySelector('iframe')?.getAttribute('data-agent')).toBe('true');
});
