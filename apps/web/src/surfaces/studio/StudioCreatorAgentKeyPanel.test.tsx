// @vitest-environment jsdom

import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import '../../i18n/index.js';
import { StudioCreatorAgentKeyPanel } from './StudioCreatorAgentKeyPanel.js';
import { recordStudioStep } from '../../visitTelemetry.js';

vi.mock('../../visitTelemetry', async () => {
  const actual = await vi.importActual<typeof import('../../visitTelemetry')>('../../visitTelemetry');
  return { ...actual, recordStudioStep: vi.fn() };
});

const mockedRecordStudioStep = vi.mocked(recordStudioStep);

const FULL_KEY = 'YzEu' + 'a'.repeat(100);

async function flush() {
  await Promise.resolve();
  await Promise.resolve();
}

describe('StudioCreatorAgentKeyPanel', () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    mockedRecordStudioStep.mockClear();
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: { writeText: vi.fn().mockResolvedValue(undefined) },
    });
  });

  afterEach(() => {
    act(() => {
      root.unmount();
    });
    container.remove();
    vi.restoreAllMocks();
  });

  it('renders a masked header and never puts the full key in the markup', async () => {
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);

    const fetchMock = vi.fn(async () => ({
      ok: true,
      json: async () => ({
        key: FULL_KEY,
        keyGeneration: 1,
        expiresAt: Math.floor(Date.now() / 1000) + 86400,
        fingerprint: '9a10e',
        authorizationHeader: `Authorization: Bearer ${FULL_KEY}`,
        authorizationHeaderMasked: 'Authorization: Bearer ····9a10e',
      }),
    }));
    vi.stubGlobal('fetch', fetchMock);

    await act(async () => {
      root.render(createElement(StudioCreatorAgentKeyPanel));
    });
    await act(async () => {
      await flush();
    });

    const markup = container.innerHTML;
    expect(markup).toContain('Authorization: Bearer ····9a10e');
    expect(markup).not.toContain(FULL_KEY);
    expect(markup).not.toContain(`Bearer ${FULL_KEY}`);
    expect(container.querySelector('[data-testid="creator-key-masked"]')?.textContent).toBe(
      'Authorization: Bearer ····9a10e',
    );
    expect(container.textContent).toContain('Active');
    expect(container.textContent).not.toMatch(/generation/i);

    await act(async () => {
      container.querySelectorAll('button').forEach((button) => {
        if (button.textContent?.includes('Copy header') || button.textContent?.includes('Kopiuj')) {
          button.click();
        }
      });
      await flush();
    });
    expect(mockedRecordStudioStep).toHaveBeenCalledWith('connect_copied', 'self', 'header');
    expect(container.textContent).toContain('Copied');

    const rotate = [...container.querySelectorAll('button')].find((button) => button.textContent === 'Rotate key');
    await act(async () => rotate?.click());
    expect(container.textContent).toContain('Every agent using the current key will lose access immediately');
    expect(document.activeElement?.textContent).toBe('Yes, rotate key');
    expect(fetchMock).toHaveBeenCalledTimes(1);

    const cancel = [...container.querySelectorAll('button')].find((button) => button.textContent === 'Cancel');
    await act(async () => cancel?.click());
    const revoke = [...container.querySelectorAll('button')].find((button) => button.textContent === 'Revoke key');
    await act(async () => revoke?.click());
    expect(container.textContent).toContain('You can create a new key later');
    expect(document.activeElement?.textContent).toBe('Yes, revoke key');
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
