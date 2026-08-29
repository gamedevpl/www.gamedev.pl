// @vitest-environment jsdom

import { act, createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import i18n from '../../i18n/index.js';
import { StudioConnectCard } from './StudioConnectCard.js';
import { setVisitSessionForTesting, VisitSession, type WireVisitEvent } from '../../visitTelemetry.js';

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

  it('defaults to Sign in and never puts the full key in markup', async () => {
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
    expect(container.textContent).toMatch(/Sign in from your agent/i);
    expect(container.textContent).toContain('Tell your agent what to build');
    expect(container.textContent).toContain('slug: sky-dodge');
    expect(container.textContent).not.toContain('key:');
    expect(container.innerHTML).not.toContain(FULL_KEY);
    expect(container.querySelector('[data-testid="connect-kickoff"]')?.textContent).toContain('slug: sky-dodge');
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

    // Paste-header path still available as the escape hatch.
    const keyTab = [...container.querySelectorAll<HTMLButtonElement>('[role="tab"]')].find((tab) =>
      tab.textContent?.includes('Paste header'),
    );
    await act(async () => {
      keyTab?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      await flush();
    });
    expect(container.textContent).toContain('Add gamedev.pl to your agent');
    expect(container.innerHTML).toContain(MASKED);
    expect(container.querySelector('[data-testid="connect-config-snippet"]')?.textContent).not.toContain(FULL_KEY);
    expect(container.textContent).toMatch(/Ends in 9a10e/);
    expect(container.textContent).toContain('Claude Code');

    await act(async () => root.unmount());
  });

  it('offers a confirmed switch to the platform agent when the round is idle', async () => {
    (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    await i18n.changeLanguage('en');
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({
        ok: true,
        json: async () => ({ ...payload, canSwitchToPlatform: true }),
      })),
    );
    const switchToPlatform = vi.fn().mockResolvedValue(undefined);

    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = createRoot(container);

    await act(async () => {
      root.render(createElement(StudioConnectCard, { token: 'status-tok', onSwitchToPlatform: switchToPlatform }));
      await flush();
    });

    expect(container.querySelector('[data-testid="connect-switch-builder"]')).not.toBeNull();
    expect(container.textContent).toContain('Use Gamedev.pl agent instead');
    await act(async () => {
      container.querySelector<HTMLButtonElement>('.studio-connect-switch-button')?.click();
      await flush();
    });
    expect(container.textContent).toContain('Stop waiting for your agent');
    expect(switchToPlatform).not.toHaveBeenCalled();

    await act(async () => {
      const buttons = [...container.querySelectorAll<HTMLButtonElement>('.studio-connect-switch-button')];
      buttons.at(-1)?.click();
      await flush();
    });
    expect(switchToPlatform).toHaveBeenCalledOnce();

    await act(async () => root.unmount());
  });

  it('drops its own waiting caption when the surrounding surface already carries one', async () => {
    (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    await i18n.changeLanguage('en');
    localStorage.setItem('gamedev_connect_collapsed:status-tok', '1');
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({ ok: true, json: async () => ({ ...payload, canSwitchToPlatform: true }) })),
    );

    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = createRoot(container);

    await act(async () => {
      root.render(
        createElement(StudioConnectCard, {
          token: 'status-tok',
          waitingCaptionElsewhere: true,
          onSwitchToPlatform: vi.fn(),
        }),
      );
      await flush();
    });
    await act(async () => {
      await flush();
    });

    expect(container.querySelector('[data-testid="connect-collapsed"]')).not.toBeNull();
    expect(container.querySelector('.studio-connect-waiting')).toBeNull();
    expect(container.textContent).not.toContain('Waiting for your agent to check in');
    // Still named for screen readers, and still offers the way out.
    expect(container.querySelector('.studio-connect')?.getAttribute('aria-label')).toContain(
      'Waiting for your coding agent',
    );
    expect(container.querySelector('[data-testid="active-switch-builder"]')).not.toBeNull();
    expect(container.querySelector('[data-testid="connect-show"]')).not.toBeNull();

    await act(async () => root.unmount());
  });

  it('shows a pending stop request without offering a second switch', async () => {
    (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    await i18n.changeLanguage('en');
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({
        ok: true,
        json: async () => ({ ...payload, canSwitchToPlatform: true }),
      })),
    );
    const switchToPlatform = vi.fn();
    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = createRoot(container);

    await act(async () => {
      root.render(
        createElement(StudioConnectCard, {
          token: 'status-tok',
          onSwitchToPlatform: switchToPlatform,
          builderHandoffPending: true,
        }),
      );
      await flush();
    });

    expect(container.textContent).toContain('Waiting for the current agent to acknowledge the stop request');
    expect(container.querySelector('.studio-connect-switch-button')).toBeNull();
    expect(switchToPlatform).not.toHaveBeenCalled();

    await act(async () => root.unmount());
  });

  it('Copy config puts the real Authorization header on the clipboard', async () => {
    (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    await i18n.changeLanguage('en');
    localStorage.setItem('gamedev_connect_auth_mode', 'key');

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
    localStorage.setItem('gamedev_connect_auth_mode', 'key');

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

  it('defaults to Sign in and remembers a Paste header choice', async () => {
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

    expect(container.textContent).toMatch(/Sign in from your agent/i);

    const keyTab = [...container.querySelectorAll<HTMLButtonElement>('[role="tab"]')].find((tab) =>
      tab.textContent?.includes('Paste header'),
    );
    await act(async () => {
      keyTab?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      await flush();
    });
    expect(localStorage.getItem('gamedev_connect_auth_mode')).toBe('key');
    expect(container.textContent).toContain('Add gamedev.pl to your agent');

    await act(async () => root.unmount());
  });

  it('rotate uses the creator-key rotate endpoint', async () => {
    (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    await i18n.changeLanguage('en');
    localStorage.setItem('gamedev_connect_auth_mode', 'key');

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

  it('hides the tall card behind a one-line strip and restores it on demand', async () => {
    (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    await i18n.changeLanguage('en');
    localStorage.clear();

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

    expect(container.querySelector('[data-testid="connect-expanded"]')).not.toBeNull();
    const hide = container.querySelector<HTMLButtonElement>('[data-testid="connect-hide"]');
    expect(hide?.textContent).toContain('Hide for now');
    // Chip affordance — not a muted underline that disappears into the title row.
    expect(hide?.classList.contains('studio-connect-hide')).toBe(true);
    // End-of-card twin: title wrap on phones buries the header control.
    expect(container.querySelector('[data-testid="connect-hide-foot"]')?.textContent).toContain('Hide for now');

    await act(async () => {
      hide?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      await flush();
    });

    expect(container.querySelector('[data-testid="connect-expanded"]')).toBeNull();
    expect(container.querySelector('[data-testid="connect-collapsed"]')).not.toBeNull();
    expect(container.querySelector('[data-testid="connect-show"]')?.textContent).toContain('Show connect steps');
    expect(container.textContent).toContain('Also in Details anytime');
    expect(localStorage.getItem('gamedev_connect_collapsed:status-tok')).toBe('1');

    await act(async () => {
      container
        .querySelector<HTMLButtonElement>('[data-testid="connect-show"]')
        ?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      await flush();
    });

    expect(container.querySelector('[data-testid="connect-expanded"]')).not.toBeNull();
    expect(container.querySelector('[data-testid="connect-kickoff"]')).not.toBeNull();
    expect(localStorage.getItem('gamedev_connect_collapsed:status-tok')).toBeNull();

    await act(async () => root.unmount());
  });

  it('stays collapsed across remount when the preference is set', async () => {
    (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    await i18n.changeLanguage('en');
    localStorage.setItem('gamedev_connect_collapsed:status-tok', '1');

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

    expect(container.querySelector('[data-testid="connect-collapsed"]')).not.toBeNull();
    expect(container.querySelector('[data-testid="connect-kickoff"]')).toBeNull();

    await act(async () => root.unmount());
  });

  it('returns nothing when hideIfUnavailable and the round is not self', async () => {
    (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    await i18n.changeLanguage('en');
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({
        ok: false,
        status: 409,
        json: async () => ({ error: 'connect_unavailable', reason: 'not_self_round', builder: 'platform' }),
      })),
    );

    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = createRoot(container);

    await act(async () => {
      root.render(createElement(StudioConnectCard, { token: 'plat-tok', hideIfUnavailable: true, collapsible: false }));
      await flush();
    });
    await act(async () => {
      await flush();
    });

    expect(container.querySelector('.studio-connect')).toBeNull();
    expect(container.textContent).toBe('');

    await act(async () => root.unmount());
  });

  it('shows unavailableLabel in the Details pane when the round is not self', async () => {
    (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    await i18n.changeLanguage('en');
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({
        ok: false,
        status: 409,
        json: async () => ({ error: 'connect_unavailable', reason: 'not_self_round', builder: 'platform' }),
      })),
    );

    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = createRoot(container);

    await act(async () => {
      root.render(
        createElement(StudioConnectCard, {
          token: 'plat-tok',
          hideIfUnavailable: true,
          unavailableLabel: 'This round does not need a coding-agent connect step.',
          collapsible: false,
          density: 'panel',
        }),
      );
      await flush();
    });
    await act(async () => {
      await flush();
    });

    expect(container.querySelector('.studio-connect')).toBeNull();
    expect(container.querySelector('.studio-rail-empty')?.textContent).toContain(
      'does not need a coding-agent connect step',
    );

    await act(async () => root.unmount());
  });

  it('surfaces missing_slug instead of hiding when hideIfUnavailable', async () => {
    (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    await i18n.changeLanguage('en');
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({
        ok: false,
        status: 409,
        json: async () => ({ error: 'connect_unavailable', reason: 'missing_slug', builder: 'self' }),
      })),
    );

    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = createRoot(container);

    await act(async () => {
      root.render(createElement(StudioConnectCard, { token: 'slugless', hideIfUnavailable: true, collapsible: false }));
      await flush();
    });
    await act(async () => {
      await flush();
    });

    expect(container.querySelector('.studio-connect.is-error')).not.toBeNull();
    expect(container.textContent).toContain("couldn't load the connect steps");

    await act(async () => root.unmount());
  });

  it('resume mode leads with the kickoff and tucks MCP install under details', async () => {
    (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    await i18n.changeLanguage('en');

    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = createRoot(container);

    await act(async () => {
      root.render(createElement(StudioConnectCard, { token: 'status-tok', mode: 'resume' }));
      await flush();
    });
    await act(async () => {
      await flush();
    });

    expect(container.querySelector('[data-connect-mode="resume"]')).not.toBeNull();
    expect(container.querySelector('.studio-connect-title')?.textContent).toContain('Continue with your agent');
    expect(container.textContent).not.toContain('Connect your coding agent');
    expect(container.querySelector('[data-testid="connect-kickoff"]')?.textContent).toContain('slug: sky-dodge');
    // Install stays under a closed disclosure — still in the DOM (jsdom keeps details
    // content), but not the primary chrome a quiet mid-round should lead with.
    const details = container.querySelector<HTMLDetailsElement>('[data-testid="connect-setup-details"]');
    expect(details).not.toBeNull();
    expect(details?.open).toBe(false);
    expect(details?.textContent).toContain('Need to reconnect MCP?');
    expect(details?.querySelector('[data-testid="connect-install-cursor"]')).not.toBeNull();
    expect(container.innerHTML).not.toContain(FULL_KEY);

    await act(async () => root.unmount());
  });

  it('panel density shows install with kickoff collapsed and no waiting wall', async () => {
    (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    await i18n.changeLanguage('en');

    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = createRoot(container);

    await act(async () => {
      root.render(
        createElement(StudioConnectCard, {
          token: 'status-tok',
          density: 'panel',
          collapsible: false,
          panelHeading: 'Connect your agent',
        }),
      );
      await flush();
    });
    await act(async () => {
      await flush();
    });

    expect(container.querySelector('[data-density="panel"]')).not.toBeNull();
    expect(container.querySelector('.studio-rail-section-title')?.textContent).toContain('Connect your agent');
    expect(container.querySelector('.studio-connect-lead')).toBeNull();
    expect(container.querySelector('.studio-connect-waiting')).toBeNull();
    expect(container.querySelector('.studio-connect-step-num')).toBeNull();
    const kickoffDetails = container.querySelector<HTMLDetailsElement>('[data-testid="connect-kickoff-details"]');
    expect(kickoffDetails).not.toBeNull();
    expect(kickoffDetails?.open).toBe(false);
    expect(kickoffDetails?.textContent).toContain('Build prompt');
    expect(container.querySelector('[data-testid="connect-install-cursor"]')).not.toBeNull();

    await act(async () => root.unmount());
  });

  it('Studio resume sends MCP install to Details instead of expanding inline', async () => {
    (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    await i18n.changeLanguage('en');
    const onOpenInstall = vi.fn();

    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = createRoot(container);

    await act(async () => {
      root.render(createElement(StudioConnectCard, { token: 'status-tok', mode: 'resume', onOpenInstall }));
      await flush();
    });
    await act(async () => {
      await flush();
    });

    expect(container.querySelector('[data-testid="connect-setup-details"]')).toBeNull();
    expect(container.querySelector('.studio-connect-waiting')).toBeNull();
    const open = container.querySelector<HTMLButtonElement>('[data-testid="connect-open-install"]');
    expect(open?.textContent).toContain('Reconnect MCP in Details');
    await act(async () => {
      open?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      await flush();
    });
    expect(onOpenInstall).toHaveBeenCalledOnce();

    await act(async () => root.unmount());
  });
});
