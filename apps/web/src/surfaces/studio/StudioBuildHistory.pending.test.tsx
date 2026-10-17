// @vitest-environment jsdom

import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';
import i18n from '../../i18n/index.js';
import { StudioBuildHistory } from './StudioBuildHistory.js';
import type { SubmissionStatus } from '../../submissionApi.js';

async function mount(
  status: SubmissionStatus,
  token?: string,
  onSealed?: () => void,
  onSelectPreviewVersion?: (version: string | null) => void,
) {
  (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  await i18n.changeLanguage('en');
  const host = document.createElement('div');
  document.body.appendChild(host);
  const root = createRoot(host);
  await act(async () => {
    root.render(
      <StudioBuildHistory
        status={status}
        token={token}
        onSealed={onSealed}
        onSelectPreviewVersion={onSelectPreviewVersion}
      />,
    );
  });
  return {
    host,
    unmount: () => {
      root.unmount();
      host.remove();
    },
  };
}

describe('pending Studio preview selection', () => {
  afterEach(() => {
    document.body.innerHTML = '';
  });
  it.each([true, false])('offers a pending preview only when its artifact is available: %s', async (available) => {
    const select = vi.fn();
    const { host, unmount } = await mount(
      {
        status: 'building',
        preview: available ? { slug: 'my-game' } : undefined,
        progress: { headSha: 'v8', commits: [], checklist: [], revisions: [] },
        recentBuilds: [{ version: 'v8', createdAt: new Date().toISOString(), mode: 'preview', verdict: 'pending' }],
      },
      undefined,
      undefined,
      select,
    );
    await act(async () => host.querySelector<HTMLElement>('.studio-build-history-summary')?.click());
    const button = host.querySelector<HTMLButtonElement>('.studio-build-history-actions button');
    expect(Boolean(button)).toBe(available);
    if (button) {
      await act(async () => button.click());
      expect(select).toHaveBeenCalledWith('v8');
    }
    unmount();
  });
});
