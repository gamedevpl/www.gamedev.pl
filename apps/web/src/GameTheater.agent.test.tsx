// @vitest-environment jsdom

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import i18n from './i18n/index.js';

let authState: {
  user: { uid: string; reviewer: boolean; tier: 'trusted' } | null;
  loading: boolean;
} = {
  user: { uid: 'reviewer-1', reviewer: true, tier: 'trusted' },
  loading: false,
};

vi.mock('./AuthContext', () => ({
  useAuth: () => ({
    ...authState,
    signInWithGoogleToken: vi.fn(),
    logout: vi.fn(),
  }),
}));

vi.mock('./votesApi', () => ({
  fetchVotes: vi.fn(),
  castVote: vi.fn(),
  clearVote: vi.fn(),
}));

vi.mock('./useScreenWakeLock', () => ({
  useScreenWakeLock: () => undefined,
}));

import { GameTheater } from './GameTheater.js';
import { AUTH_HOLD_TIMEOUT_MS } from './useAgentBridge.js';

let container: HTMLDivElement;
let root: Root | null = null;
const originalFetch = globalThis.fetch;

beforeEach(async () => {
  (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  await i18n.changeLanguage('en');
  authState = {
    user: { uid: 'reviewer-1', reviewer: true, tier: 'trusted' },
    loading: false,
  };
  container = document.createElement('div');
  document.body.appendChild(container);
  globalThis.fetch = vi.fn().mockImplementation(async (input: RequestInfo | URL) => {
    const url = String(input);
    if (url.includes('/api/agent-play/bridge')) {
      return {
        ok: true,
        json: async () => ({ source: 'console.log("agent bridge active");' }),
      };
    }
    return { ok: false, status: 404 };
  });
});

afterEach(async () => {
  if (root) {
    await act(async () => {
      root!.unmount();
    });
    root = null;
  }
  container.remove();
  globalThis.fetch = originalFetch;
});

describe('GameTheater agent play for draft games', () => {
  it('loads agent bridge and provides agent menu for draft HTML source', async () => {
    root = createRoot(container);
    await act(async () => {
      root!.render(
        <GameTheater
          title="Transport Tycoon Remake"
          badge={{ icon: 'wrench', label: 'Draft' }}
          source={{ html: '<!DOCTYPE html><html><body><canvas></canvas></body></html>' }}
          onExit={() => undefined}
        />,
      );
    });

    // Wait for the agent bridge fetch to resolve and state to update
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 20));
    });

    // Open More menu
    const moreBtn = container.querySelector('.theater-more-btn') as HTMLButtonElement | null;
    expect(moreBtn).not.toBeNull();
    await act(async () => {
      moreBtn?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    // Gamepad button appears in More menu.
    const agentMenuItem = Array.from(container.querySelectorAll('.theater-menu-item')).find((el) =>
      el.textContent?.includes('Agent mode'),
    );
    expect(agentMenuItem).toBeDefined();

    // Verify GameFrame received the agentBridge in its srcDoc
    const iframe = container.querySelector('iframe.game-frame') as HTMLIFrameElement | null;
    expect(iframe).not.toBeNull();
    expect(iframe?.srcdoc).toContain('agent bridge active');
  });

  it('automatically opens AgentPlayPanel on a draft when ?agent=1 is requested', async () => {
    window.history.replaceState(null, '', '/play/transport-tycoon-remake?agent=1');

    try {
      root = createRoot(container);
      await act(async () => {
        root!.render(
          <GameTheater
            title="Transport Tycoon Remake"
            badge={{ icon: 'wrench', label: 'Draft' }}
            source={{ html: '<!DOCTYPE html><html><body><canvas></canvas></body></html>' }}
            onExit={() => undefined}
          />,
        );
      });

      await act(async () => {
        await new Promise((resolve) => setTimeout(resolve, 20));
      });

      // AgentPlayPanel should be rendered and open (renders <aside className="agent-play">)
      const agentPanel = container.querySelector('.agent-play');
      expect(agentPanel).not.toBeNull();
      expect(agentPanel?.getAttribute('role')).toBe('dialog');
    } finally {
      window.history.replaceState(null, '', '/play/transport-tycoon-remake');
    }
  });

  it('mounts immediately without hold when reviewer is not plausible', async () => {
    authState = { user: null, loading: true };
    window.localStorage.clear();
    window.history.replaceState(null, '', '/play/transport-tycoon-remake');
    root = createRoot(container);
    await act(async () => {
      root!.render(
        <GameTheater
          title="Transport Tycoon Remake"
          badge={{ icon: 'wrench', label: 'Draft' }}
          source={{ html: '<!DOCTYPE html><html><body><canvas></canvas></body></html>' }}
          onExit={() => undefined}
        />,
      );
    });

    // Unhinted visitors mount the raw HTML iframe on frame 1 without delay.
    expect(container.querySelector('.app-loading-screen')).toBeNull();
    const iframe = container.querySelector('iframe.game-frame') as HTMLIFrameElement | null;
    expect(iframe).not.toBeNull();
    expect(iframe?.srcdoc).toContain('<canvas></canvas>');
  });

  it('holds mount while auth is loading for plausible reviewers, preventing iframe churn', async () => {
    authState = { user: null, loading: true };
    window.history.replaceState(null, '', '/play/transport-tycoon-remake?agent=1');
    try {
      root = createRoot(container);
      await act(async () => {
        root!.render(
          <GameTheater
            title="Transport Tycoon Remake"
            badge={{ icon: 'wrench', label: 'Draft' }}
            source={{ html: '<!DOCTYPE html><html><body><canvas></canvas></body></html>' }}
            onExit={() => undefined}
          />,
        );
      });

      // While auth is unresolved, load screen holds mount.
      expect(container.querySelector('.app-loading-screen')).not.toBeNull();
      expect(container.querySelector('iframe.game-frame')).toBeNull();

      // Auth resolves as reviewer.
      authState = {
        user: { uid: 'reviewer-1', reviewer: true, tier: 'trusted' },
        loading: false,
      };
      await act(async () => {
        root!.render(
          <GameTheater
            title="Transport Tycoon Remake"
            badge={{ icon: 'wrench', label: 'Draft' }}
            source={{ html: '<!DOCTYPE html><html><body><canvas></canvas></body></html>' }}
            onExit={() => undefined}
          />,
        );
      });

      await act(async () => {
        await new Promise((resolve) => setTimeout(resolve, 20));
      });

      // Frame mounts cleanly with the bridge once ready.
      const iframe = container.querySelector('iframe.game-frame') as HTMLIFrameElement | null;
      expect(iframe).not.toBeNull();
      expect(iframe?.srcdoc).toContain('agent bridge active');
    } finally {
      window.history.replaceState(null, '', '/play/transport-tycoon-remake');
    }
  });

  it('bounds the hold with a timeout if auth never settles', async () => {
    vi.useFakeTimers();
    try {
      authState = { user: null, loading: true };
      window.history.replaceState(null, '', '/play/transport-tycoon-remake?agent=1');
      root = createRoot(container);
      await act(async () => {
        root!.render(
          <GameTheater
            title="Transport Tycoon Remake"
            badge={{ icon: 'wrench', label: 'Draft' }}
            source={{ html: '<!DOCTYPE html><html><body><canvas></canvas></body></html>' }}
            onExit={() => undefined}
          />,
        );
      });

      expect(container.querySelector('.app-loading-screen')).not.toBeNull();
      expect(container.querySelector('iframe.game-frame')).toBeNull();

      // Advance past AUTH_HOLD_TIMEOUT_MS.
      await act(async () => {
        await vi.advanceTimersByTimeAsync(AUTH_HOLD_TIMEOUT_MS + 50);
      });

      // Timeout fallback lifts loading screen and mounts frame.
      expect(container.querySelector('.app-loading-screen')).toBeNull();
      const iframe = container.querySelector('iframe.game-frame') as HTMLIFrameElement | null;
      expect(iframe).not.toBeNull();
      expect(iframe?.srcdoc).toContain('<canvas></canvas>');
    } finally {
      vi.useRealTimers();
      window.history.replaceState(null, '', '/play/transport-tycoon-remake');
    }
  });
});
