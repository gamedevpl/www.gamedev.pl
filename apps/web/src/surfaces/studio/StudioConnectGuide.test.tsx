// @vitest-environment jsdom
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import i18n from '../../i18n/index.js';
import { StudioConnectGuide } from './StudioConnectGuide.js';
import { getConnectPayload, type ConnectPayload } from './connectApi.js';
vi.mock('./connectApi.js', async (original) => ({
  ...(await original<typeof import('./connectApi.js')>()),
  getConnectPayload: vi.fn(),
}));
vi.mock('../../useCliSurfaceEnabled.js', () => ({ useCliSurfaceEnabled: () => true }));
let root: Root;
let host: HTMLDivElement;
const clipboard = vi.fn(async () => {});
const payload: ConnectPayload = {
  slug: 'sky',
  mcpUrl: 'https://example.test/mcp',
  authorizationHeader: 'Authorization: Bearer SECRET',
  authorizationHeaderMasked: 'Authorization: Bearer MASK',
  installSnippets: {
    codex: 'header = "Bearer MASK"',
    cursor: 'Authorization: Bearer MASK',
    claudeCode: 'Authorization: Bearer MASK',
    kimi: 'Authorization: Bearer MASK',
    cli: '',
  },
  installLinks: { cursor: 'cursor://url-only', vscode: 'vscode://url-only' },
  kickoffPrompt: 'Build sky',
  expiresAt: 2000000000,
  keyGeneration: 1,
  fingerprint: 'MASK',
  canSwitchToPlatform: true,
};
async function click(text: string) {
  const button = Array.from(host.querySelectorAll('button')).find((el) => el.textContent === text);
  expect(button, text).toBeTruthy();
  await act(async () => {
    button!.click();
  });
}
beforeEach(async () => {
  await i18n.changeLanguage('en');
  vi.mocked(getConnectPayload).mockResolvedValue(payload);
  Object.defineProperty(navigator, 'clipboard', { value: { writeText: clipboard }, configurable: true });
  host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);
  await act(async () => {
    root.render(createElement(StudioConnectGuide, { token: 'tok', pending: false, onSwitchToPlatform: vi.fn() }));
  });
});
afterEach(async () => {
  await act(async () => root.unmount());
  host.remove();
  vi.clearAllMocks();
});
it('starts with choices and progressively shows only the selected agent setup and prompt', async () => {
  expect(host.querySelector('pre')).toBeNull();
  await act(async () => {
    (host.querySelectorAll('.connect-guide-option')[1] as HTMLButtonElement).click();
  });
  await click('Codex');
  expect(host.textContent).toContain('https://example.test/mcp');
  expect(host.textContent).not.toContain('MASK');
  await click('Sign-in did not work / manual setup');
  expect(host.textContent).toContain('header = "Bearer MASK"');
  expect(host.textContent).not.toContain('Build sky');
  expect(host.textContent).not.toContain('SECRET');
  await click('Copy');
  expect(clipboard).toHaveBeenCalledWith('header = "Bearer SECRET"');
  await click('Setup done — continue');
  expect(host.textContent).toContain('Build sky');
  expect(host.textContent).not.toContain('header =');
  expect(host.textContent).toContain('not confirmed');
  await click('← Change choice');
  expect(host.textContent).toContain('header =');
});
it('offers terminal commands separately, including Windows and a game without sources', async () => {
  await act(async () => {
    (host.querySelector('.connect-guide-option') as HTMLButtonElement).click();
  });
  expect(host.textContent).toContain('gamedevpl connect sky');
  expect(host.textContent).toContain('No code yet?');
  expect(host.textContent).not.toContain('Build sky');
  await click('Windows');
  expect(host.textContent).toContain('install.ps1');
  expect(host.textContent).not.toContain('install.sh');
});
it('keeps generic manual credentials masked and copies the real header only on request', async () => {
  await act(async () => {
    (host.querySelectorAll('.connect-guide-option')[1] as HTMLButtonElement).click();
  });
  await click('Another MCP tool');
  expect(host.textContent).not.toContain('MASK');
  await click('Sign-in did not work / manual setup');
  expect(host.textContent).toContain('Authorization: Bearer MASK');
  expect(host.textContent).not.toContain('SECRET');
  await click('Copy');
  expect(clipboard).toHaveBeenCalledWith('URL: https://example.test/mcp\nAuthorization: Bearer SECRET');
});

it('offers browser sign-in for Claude Code before manual credentials', async () => {
  await act(async () => (host.querySelectorAll('.connect-guide-option')[1] as HTMLButtonElement).click());
  await click('Claude Code');
  expect(host.textContent).toContain('https://example.test/mcp');
  expect(host.textContent).not.toContain('MASK');
});
it('routes Muse through a local CLI checkout instead of claiming MCP support', async () => {
  await act(async () => (host.querySelectorAll('.connect-guide-option')[1] as HTMLButtonElement).click());
  await click('Muse Code (Meta)');
  expect(host.textContent).toContain('gamedevpl connect sky');
  expect(host.textContent).not.toContain('MASK');
  await click('Setup done — continue');
  expect(host.textContent).toContain('Open a local checkout');
  expect(host.textContent).toContain('does not configure MCP');
});
