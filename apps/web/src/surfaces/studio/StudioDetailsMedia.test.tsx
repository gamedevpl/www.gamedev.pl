// @vitest-environment jsdom

import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';
import i18n from '../../i18n/index.js';
import { StudioDetailsMedia } from './StudioDetailsMedia.js';

const getSubmissionStatus = vi.fn();

vi.mock('../../submissionApi.js', () => ({
  getSubmissionStatus: (...args: unknown[]) => getSubmissionStatus(...args),
  buildMediaUrl: (_token: string, item: { ref: string }) => `/shot/${item.ref}`,
}));

describe('StudioDetailsMedia', () => {
  afterEach(() => {
    document.body.innerHTML = '';
    getSubmissionStatus.mockReset();
  });

  it('renders a grid of screenshots and opens the lightbox', async () => {
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
      root.render(<StudioDetailsMedia token="tok-grid" />);
    });
    await act(async () => {
      await Promise.resolve();
    });

    expect(getSubmissionStatus).toHaveBeenCalledWith('tok-grid', 'en');
    expect(host.querySelector('[data-testid="studio-details-media"]')).not.toBeNull();
    expect(host.querySelectorAll('.studio-details-media-card')).toHaveLength(2);

    await act(async () => {
      (host.querySelector('.studio-details-media-card') as HTMLButtonElement).click();
    });
    expect(host.querySelector('.studio-shot-lightbox')).not.toBeNull();

    root.unmount();
    host.remove();
  });

  it('shows the empty label when there is no media', async () => {
    (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    await i18n.changeLanguage('en');
    getSubmissionStatus.mockResolvedValue({ media: [] });

    const host = document.createElement('div');
    document.body.appendChild(host);
    const root = createRoot(host);

    await act(async () => {
      root.render(<StudioDetailsMedia token="tok-empty" emptyLabel="Nothing yet" />);
    });
    await act(async () => {
      await Promise.resolve();
    });

    expect(host.querySelector('.studio-rail-empty')?.textContent).toContain('Nothing yet');

    root.unmount();
    host.remove();
  });
});
