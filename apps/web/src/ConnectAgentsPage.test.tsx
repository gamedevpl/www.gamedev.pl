// @vitest-environment jsdom

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ConnectAgentsPage } from './ConnectAgentsPage.js';
import i18n from './i18n/index.js';

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
  vi.unstubAllGlobals();
});

async function draw(cliOn: boolean): Promise<void> {
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: RequestInfo) => {
      const url = String(input);
      if (url.includes('/api/cli/enabled')) {
        return cliOn
          ? new Response(JSON.stringify({ enabled: true }), { status: 200 })
          : new Response(JSON.stringify({ error: 'not found' }), { status: 404 });
      }
      return new Response('{}', { status: 404 });
    }),
  );
  root = createRoot(container);
  await act(async () => {
    root!.render(<ConnectAgentsPage onBack={() => undefined} />);
    await Promise.resolve();
    await Promise.resolve();
  });
}

describe('ConnectAgentsPage', () => {
  it('always shows the MCP endpoint and never a create-funnel CTA', async () => {
    await draw(false);
    expect(container.textContent).toMatch(/\/api\/mcp/);
    expect(container.querySelector('a[href="#mcp"]')).not.toBeNull();
    expect(container.querySelector('a[href="#cli"]')).not.toBeNull();
    expect(container.textContent).not.toMatch(/Build My Game/i);
    expect(container.querySelector('a[href="/create"]')).toBeNull();
  });

  it('hides the installer one-liner while the CLI surface is off', async () => {
    await draw(false);
    expect(container.textContent).not.toMatch(/install\.sh/);
    expect(container.textContent).toMatch(/not public yet/i);
  });

  it('shows the checksummed installer when the CLI surface is on', async () => {
    await draw(true);
    expect(container.textContent).toMatch(/install\.sh/);
    expect(container.textContent).toMatch(/Node 20/);
  });
});
