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

const FULL_KEY = 'YzEu' + 'b'.repeat(120);
const MASKED = 'Authorization: Bearer ····9a10e';
const MCP_URL = 'https://www.gamedev.pl/api/mcp';
/** Credential-free deep links — server URL only (mirrors apps/api mcp-install-links). */
const INSTALL_LINKS = {
  cursor:
    'cursor://anysphere.cursor-deeplink/mcp/install?name=gamedevpl&config=' + btoa(JSON.stringify({ url: MCP_URL })),
  vscode: `vscode:mcp/install?${encodeURIComponent(JSON.stringify({ name: 'gamedevpl', type: 'http', url: MCP_URL }))}`,
};

const payload = {
  installSnippets: {
    claudeCode: `claude mcp add --transport http gamedevpl ${MCP_URL} --header "${MASKED}"`,
    codex: `[mcp_servers.gamedevpl]\nurl = "${MCP_URL}"\nhttp_headers = { Authorization = "Bearer ····9a10e" }`,
    cursor: JSON.stringify(
      {
        mcpServers: {
          gamedevpl: {
            url: MCP_URL,
            headers: { Authorization: 'Bearer ····9a10e' },
          },
        },
      },
      null,
      2,
    ),
    kimi: `npx -y mcp-remote ${MCP_URL}\n# set header: ${MASKED}`,
    cli: `curl -sS -X POST ${MCP_URL} -H "${MASKED}"`,
  },
  installLinks: INSTALL_LINKS,
  kickoffPrompt:
    'Build "Sky Dodge" for gamedev.pl.\nStart with the gamedevpl tool, slug: sky-dodge.\nstart returns your workflow; after gate green the round is done.',
  mcpUrl: MCP_URL,
  authorizationHeader: `Authorization: Bearer ${FULL_KEY}`,
  authorizationHeaderMasked: MASKED,
  fingerprint: '9a10e',
  expiresAt: Math.floor(Date.now() / 1000) + 90 * 24 * 60 * 60,
  keyGeneration: 1,
  slug: 'sky-dodge',
};

describe('StudioConnectCard', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo) => {
        const url = String(input);
        if (url.includes('/creator-agent-key/rotate')) {
          return {
            ok: true,
            json: async () => ({
              key: FULL_KEY + 'x',
              keyGeneration: 2,
              expiresAt: payload.expiresAt,
              fingerprint: 'rotated',
              authorizationHeader: `Authorization: Bearer ${FULL_KEY}x`,
              authorizationHeaderMasked: 'Authorization: Bearer ····tated',
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

  it('renders masked config + keyless kickoff and never puts the full key in markup', async () => {
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
    expect(container.textContent).toContain('Add gamedev.pl to your agent');
    expect(container.textContent).toContain('Tell your agent what to build');
    expect(container.textContent).toContain('slug: sky-dodge');
    expect(container.textContent).not.toContain('key:');
    expect(container.innerHTML).toContain(MASKED);
    expect(container.innerHTML).not.toContain(FULL_KEY);
    expect(container.querySelector('[data-testid="connect-config-snippet"]')?.textContent).not.toContain(FULL_KEY);
    expect(container.querySelector('[data-testid="connect-kickoff"]')?.textContent).toContain('slug: sky-dodge');
    expect(container.textContent).toMatch(/Ends in 9a10e/);
    expect(container.textContent?.toLowerCase()).not.toMatch(/\btoken\b/);
    expect(container.querySelector('.studio-connect-waiting')).not.toBeNull();

    const cursorLink = container.querySelector<HTMLAnchorElement>('[data-testid="connect-install-cursor"]');
    const vscodeLink = container.querySelector<HTMLAnchorElement>('[data-testid="connect-install-vscode"]');
    expect(cursorLink?.getAttribute('href')).toBe(INSTALL_LINKS.cursor);
    expect(vscodeLink?.getAttribute('href')).toBe(INSTALL_LINKS.vscode);
    // REGRESSION: deep-link hrefs must never embed the creator key (or any Authorization material).
    expect(cursorLink?.getAttribute('href')).not.toContain(FULL_KEY);
    expect(vscodeLink?.getAttribute('href')).not.toContain(FULL_KEY);
    expect(cursorLink?.getAttribute('href')).not.toMatch(/Authorization|Bearer|headers/i);
    expect(vscodeLink?.getAttribute('href')).not.toMatch(/Authorization|Bearer|headers/i);
    // Hand-copy config path stays for clients without a deep link.
    expect(container.querySelector('[data-testid="connect-config-snippet"]')).not.toBeNull();
    expect(container.textContent).toContain('Claude Code');

    await act(async () => root.unmount());
  });

  it('Copy config puts the real Authorization header on the clipboard', async () => {
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

    const copyConfig = [...container.querySelectorAll<HTMLButtonElement>('.status-share-copy')].find((btn) =>
      btn.textContent?.includes('Copy config'),
    );
    await act(async () => {
      copyConfig?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      await flush();
    });

    expect(navigator.clipboard.writeText).toHaveBeenCalledWith(expect.stringContaining(FULL_KEY));
    expect(container.innerHTML).not.toContain(FULL_KEY);

    await act(async () => root.unmount());
  });

  it('Copy config replaces Bearer-only masks in Codex and Cursor snippets', async () => {
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

    const clientTabs = container.querySelector('[aria-label="Agent client"]');
    expect(clientTabs).toBeTruthy();

    for (const clientLabel of ['Codex', 'Cursor']) {
      const tab = [...(clientTabs?.querySelectorAll<HTMLButtonElement>('[role="tab"]') ?? [])].find((btn) =>
        btn.textContent?.includes(clientLabel),
      );
      expect(tab).toBeTruthy();
      await act(async () => {
        tab?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
        await flush();
      });

      vi.mocked(navigator.clipboard.writeText).mockClear();
      // First share-copy in the config step (label toggles to "Copied" after click).
      const copyConfig = container.querySelector<HTMLButtonElement>('.studio-connect-step .status-share-copy');
      expect(copyConfig).toBeTruthy();
      await act(async () => {
        copyConfig?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
        await flush();
      });

      const written = String(vi.mocked(navigator.clipboard.writeText).mock.calls.at(-1)?.[0] ?? '');
      expect(written).toContain(FULL_KEY);
      expect(written).toContain(`Bearer ${FULL_KEY}`);
      expect(written).not.toContain('····9a10e');
      expect(container.innerHTML).not.toContain(FULL_KEY);
    }

    await act(async () => root.unmount());
  });

  it('remembers auth mode choice between Paste header and Sign in', async () => {
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

    const oauthTab = [...container.querySelectorAll<HTMLButtonElement>('[role="tab"]')].find((tab) =>
      tab.textContent?.includes('Sign in'),
    );
    await act(async () => {
      oauthTab?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      await flush();
    });
    expect(localStorage.getItem('gamedev_connect_auth_mode')).toBe('oauth');
    expect(container.textContent).toMatch(/Sign in from your agent/i);

    await act(async () => root.unmount());
  });

  it('rotate uses the creator-key rotate endpoint', async () => {
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
      expect.stringContaining('/api/me/creator-agent-key/rotate'),
      expect.objectContaining({ method: 'POST', credentials: 'include' }),
    );

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

  it('emits connect_deeplink studio telemetry for one-click install clicks', async () => {
    (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    await i18n.changeLanguage('en');
    const events: WireVisitEvent[] = [];
    const session = new VisitSession('v-deeplink', 0, (body) => {
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

      const cursor = container.querySelector<HTMLAnchorElement>('[data-testid="connect-install-cursor"]');
      const vscode = container.querySelector<HTMLAnchorElement>('[data-testid="connect-install-vscode"]');
      expect(cursor).toBeTruthy();
      expect(vscode).toBeTruthy();

      await act(async () => {
        cursor?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
        await flush();
      });
      await act(async () => {
        vscode?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
        await flush();
      });
      session.flush();

      expect(events).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            type: 'studio_step',
            step: 'connect_deeplink',
            builder: 'self',
            detail: 'cursor',
          }),
          expect.objectContaining({
            type: 'studio_step',
            step: 'connect_deeplink',
            builder: 'self',
            detail: 'vscode',
          }),
        ]),
      );
      // Deeplink clicks must not be recorded as connect_copied.
      expect(events.some((event) => event.type === 'studio_step' && event.step === 'connect_copied')).toBe(false);
    } finally {
      setVisitSessionForTesting(null);
      await act(async () => root.unmount());
    }
  });
});
