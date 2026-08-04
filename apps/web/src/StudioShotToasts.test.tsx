// @vitest-environment jsdom

import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';
import i18n from './i18n/index.js';
import { StudioShotToasts } from './StudioShotToasts.js';

const getSubmissionStatus = vi.fn();

vi.mock('./submissionApi.js', () => ({
  getSubmissionStatus: (...args: unknown[]) => getSubmissionStatus(...args),
  buildMediaUrl: (_token: string, item: { ref: string }) => `/shot/${item.ref}`,
}));

describe('StudioShotToasts', () => {
  afterEach(() => {
    document.body.innerHTML = '';
    sessionStorage.clear();
    getSubmissionStatus.mockReset();
  });

  it('stacks dismissable screenshot toasts and removes one on dismiss', async () => {
    (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    await i18n.changeLanguage('en');
    getSubmissionStatus.mockResolvedValue({
      media: [
        { source: 'channel', ref: 'a', label: 'First look' },
        { source: 'channel', ref: 'b', label: 'Boss fight' },
      ],
    });

    const host = document.createElement('div');
    document.body.appendChild(host);
    const root = createRoot(host);

    await act(async () => {
      root.render(<StudioShotToasts token="tok" placement="bottom-right" />);
    });
    await act(async () => {
      await Promise.resolve();
    });

    expect(host.querySelector('.studio-shot-toasts.is-bottom-right')).not.toBeNull();
    expect(host.querySelectorAll('.studio-shot-toast')).toHaveLength(2);

    const dismiss = host.querySelector('.studio-shot-toast-dismiss') as HTMLButtonElement;
    await act(async () => {
      dismiss.click();
    });

    expect(host.querySelectorAll('.studio-shot-toast')).toHaveLength(1);

    root.unmount();
    host.remove();
  });

  it('renders nothing when there is no media', async () => {
    (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    await i18n.changeLanguage('en');
    getSubmissionStatus.mockResolvedValue({ media: [] });

    const host = document.createElement('div');
    document.body.appendChild(host);
    const root = createRoot(host);

    await act(async () => {
      root.render(<StudioShotToasts token="tok" />);
    });
    await act(async () => {
      await Promise.resolve();
    });

    expect(host.querySelector('.studio-shot-toasts')).toBeNull();

    root.unmount();
    host.remove();
  });
});
