// @vitest-environment jsdom

import { act, createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import i18n from './i18n/index.js';
import { StudioAgentKeyPanel } from './StudioAgentKeyPanel.js';

async function flush() {
  await Promise.resolve();
  await Promise.resolve();
}

const agentKeyPayload = {
  slug: 'sky-dodge',
  keyGeneration: 1,
  expiresAt: Math.floor(Date.now() / 1000) + 90 * 24 * 60 * 60,
  kickoffPrompt:
    'Build "Sky Dodge" for gamedev.pl.\nStart with the gamedevpl tool, key: abc.def\nstart returns your workflow; after gate green the round is done — keep this key for the next round on this game unless the creator rotates it.',
  installSnippets: {
    claudeCode: 'claude mcp add --transport http gamedevpl https://www.gamedev.pl/api/mcp',
    codex: '[mcp_servers.gamedevpl]\nurl = "https://www.gamedev.pl/api/mcp"',
    cursor: '{\n  "mcpServers": {\n    "gamedevpl": {\n      "url": "https://www.gamedev.pl/api/mcp"\n    }\n  }\n}',
    kimi: 'npx -y mcp-remote https://www.gamedev.pl/api/mcp',
    cli: 'curl -sS -X POST https://www.gamedev.pl/api/mcp',
  },
};

describe('StudioAgentKeyPanel', () => {
  beforeEach(() => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo) => {
        const url = String(input);
        if (url.includes('/agent-key/rotate')) {
          return {
            ok: true,
            json: async () => ({
              ...agentKeyPayload,
              keyGeneration: 2,
              kickoffPrompt: agentKeyPayload.kickoffPrompt.replace('abc.def', 'rotated.key'),
              rotated: true,
            }),
          };
        }
        return {
          ok: true,
          json: async () => agentKeyPayload,
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

  it('loads expiry and offers rotate without an open-rounds toggle', async () => {
    (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    await i18n.changeLanguage('en');

    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = createRoot(container);

    await act(async () => {
      root.render(createElement(StudioAgentKeyPanel, { token: 'status-tok' }));
      await flush();
    });
    await act(async () => {
      await flush();
    });

    expect(container.textContent).toMatch(/Per-game key/i);
    expect(container.textContent).toMatch(/legacy/i);
    expect(container.querySelector('[role="switch"]')).toBeNull();
    expect(container.textContent).not.toMatch(/Let my agent start new rounds/i);
    expect(container.textContent).toContain('Rotate key');

    await act(async () => root.unmount());
  });
});
