// @vitest-environment jsdom

import { act, createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import i18n from './i18n/index.js';
import { StudioConnectCard } from './StudioConnectCard.js';
import { setVisitSessionForTesting, VisitSession, type WireVisitEvent } from './visitTelemetry.js';

async function flush() {
  await Promise.resolve();
  await Promise.resolve();
}

const payload = {
  installSnippets: {
    claudeCode: 'claude mcp add --transport http gamedevpl https://www.gamedev.pl/api/mcp',
    codex: '[mcp_servers.gamedevpl]\nurl = "https://www.gamedev.pl/api/mcp"',
    cursor: '{\n  "mcpServers": {\n    "gamedevpl": {\n      "url": "https://www.gamedev.pl/api/mcp"\n    }\n  }\n}',
    kimi: 'npx -y mcp-remote https://www.gamedev.pl/api/mcp',
    cli: 'curl -sS -X POST https://www.gamedev.pl/api/mcp',
  },
  kickoffPrompt:
    'Build "Sky Dodge" for gamedev.pl.\nStart with the gamedevpl tool, key: abc.def\nstart returns your workflow; after gate green the round is done — keep this key for the next round on this game unless the creator rotates it.',
  expiresAt: Math.floor(Date.now() / 1000) + 90 * 24 * 60 * 60,
  keyGeneration: 1,
};

describe('StudioConnectCard', () => {
  beforeEach(() => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo) => {
        const url = String(input);
        if (url.includes('/agent-key/rotate')) {
          return {
            ok: true,
            json: async () => ({
              ...payload,
              keyGeneration: 2,
              kickoffPrompt: payload.kickoffPrompt.replace('abc.def', 'rotated.key'),
              rotated: true,
            }),
          };
        }
        return {
          ok: true,
          json: async () => payload,
        };
      }),
    );
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: { writeText: vi.fn().mockResolvedValue(undefined) },
    });
  });

  afterEach(() => {
    document.body.innerHTML = '';
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('renders install tabs, kickoff, expiry, and waiting state', async () => {
    (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    await i18n.changeLanguage('en');

    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = createRoot(container);

    await act(async () => {
      root.render(createElement(StudioConnectCard, { token: 'status-tok' }));
      await flush();
    });
    await act(async () => {
      await flush();
    });

    expect(fetch).toHaveBeenCalledWith(
      expect.stringContaining('/api/submissions/status-tok/connect'),
      expect.objectContaining({ credentials: 'include' }),
    );
    expect(container.querySelector('.studio-connect-title')?.textContent).toContain('Connect your coding agent');
    expect(container.querySelectorAll('[role="tab"]')).toHaveLength(5);
    expect(container.textContent).toContain('Add gamedev.pl to your agent');
    expect(container.textContent).toContain('Tell your agent what to build');
    expect(container.textContent).toContain(payload.kickoffPrompt.split('\n')[0]);
    expect(container.textContent).toMatch(/works for this game/i);
    expect(container.textContent).toMatch(/stays too unless you rotate/i);
    expect(container.textContent?.toLowerCase()).not.toMatch(/\btoken\b/);
    expect(container.querySelector('.studio-connect-waiting')).not.toBeNull();
    expect(container.textContent).toContain('Rotate key');

    const cursorTab = [...container.querySelectorAll<HTMLButtonElement>('[role="tab"]')].find((tab) =>
      tab.textContent?.includes('Cursor'),
    );
    await act(async () => {
      cursorTab?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      await flush();
    });
    expect(container.querySelector('.studio-connect-snippet')?.textContent).toContain('mcpServers');

    await act(async () => {
      container
        .querySelector<HTMLButtonElement>('.studio-connect-skip')
        ?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      await flush();
    });
    expect(container.textContent).toContain('Skipped');

    await act(async () => root.unmount());
  });

  it('shows sameKeyAsBefore reminder when the payload says so', async () => {
    (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    await i18n.changeLanguage('en');
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({
        ok: true,
        json: async () => ({ ...payload, sameKeyAsBefore: true }),
      })),
    );

    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = createRoot(container);

    await act(async () => {
      root.render(createElement(StudioConnectCard, { token: 'status-tok' }));
      await flush();
    });
    await act(async () => {
      await flush();
    });

    expect(container.textContent).toMatch(/Same key as before/i);
    await act(async () => root.unmount());
  });

  it('rotate flow confirms then refreshes the kickoff', async () => {
    (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    await i18n.changeLanguage('en');

    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = createRoot(container);

    await act(async () => {
      root.render(createElement(StudioConnectCard, { token: 'status-tok' }));
      await flush();
    });
    await act(async () => {
      await flush();
    });

    const rotateStart = [...container.querySelectorAll<HTMLButtonElement>('button')].find((btn) =>
      btn.textContent?.includes('Rotate key'),
    );
    await act(async () => {
      rotateStart?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      await flush();
    });
    expect(container.textContent).toMatch(/Rotating stops any agent still using the old key/i);

    const confirm = [...container.querySelectorAll<HTMLButtonElement>('button')].find(
      (btn) => btn.textContent?.includes('Rotate') && !btn.textContent?.includes('Rotate key'),
    );
    await act(async () => {
      confirm?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      await flush();
    });
    await act(async () => {
      await flush();
    });

    expect(fetch).toHaveBeenCalledWith(
      expect.stringContaining('/api/submissions/status-tok/agent-key/rotate'),
      expect.objectContaining({ method: 'POST', credentials: 'include' }),
    );
    expect(container.textContent).toContain('rotated.key');

    await act(async () => root.unmount());
  });

  it('hides when the agent has already connected', async () => {
    (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    await i18n.changeLanguage('en');

    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = createRoot(container);

    await act(async () => {
      root.render(createElement(StudioConnectCard, { token: 'status-tok', agentConnected: true }));
      await flush();
    });

    expect(container.querySelector('.studio-connect')).toBeNull();
    await act(async () => root.unmount());
  });

  it('emits connect_copied studio telemetry with builder=self', async () => {
    (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    await i18n.changeLanguage('en');
    const events: WireVisitEvent[] = [];
    const session = new VisitSession('v-connect', 0, (body) => {
      events.push(...body.events);
    });
    setVisitSessionForTesting(session);

    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = createRoot(container);

    try {
      await act(async () => {
        root.render(createElement(StudioConnectCard, { token: 'status-tok' }));
        await flush();
      });
      await act(async () => {
        await flush();
      });

      const copyButtons = [...container.querySelectorAll<HTMLButtonElement>('.status-share-copy')];
      expect(copyButtons.length).toBeGreaterThanOrEqual(2);

      await act(async () => {
        copyButtons[0]?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
        await flush();
      });
      await act(async () => {
        copyButtons[1]?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
        await flush();
      });
      session.flush();

      expect(events).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            type: 'studio_step',
            step: 'connect_copied',
            builder: 'self',
            detail: 'install',
          }),
          expect.objectContaining({
            type: 'studio_step',
            step: 'connect_copied',
            builder: 'self',
            detail: 'kickoff',
          }),
        ]),
      );
    } finally {
      setVisitSessionForTesting(null);
      await act(async () => root.unmount());
    }
  });
});
