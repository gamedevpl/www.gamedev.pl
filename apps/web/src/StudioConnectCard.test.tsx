// @vitest-environment jsdom

import { act, createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import i18n from './i18n/index.js';
import { StudioConnectCard } from './StudioConnectCard.js';

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
  kickoffPrompt: 'Build "Sky Dodge" for gamedev.pl.\nStart with the gamedevpl tool, key: abc.def',
  expiresAt: Math.floor(Date.now() / 1000) + 14 * 24 * 60 * 60,
};

describe('StudioConnectCard', () => {
  beforeEach(() => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({
        ok: true,
        json: async () => payload,
      })),
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

  it('renders install tabs, kickoff, and waiting state', async () => {
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
    expect(container.textContent).toMatch(/key works only for this game/i);
    expect(container.textContent?.toLowerCase()).not.toMatch(/\btoken\b/);
    expect(container.querySelector('.studio-connect-waiting')).not.toBeNull();

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
});
