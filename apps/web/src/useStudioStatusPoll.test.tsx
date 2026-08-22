// @vitest-environment jsdom

import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('./submissionApi.js', () => ({
  getSubmissionStatus: vi.fn(async () => ({ status: 'building' })),
}));

import i18n from './i18n/index.js';
import { getSubmissionStatus } from './submissionApi.js';
import { useStudioStatusPoll } from './useStudioStatusPoll.js';

const cleanups: Array<() => void> = [];

function Probe({ token }: { token: string }) {
  useStudioStatusPoll(token);
  return null;
}

async function mount(token: string) {
  (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  const host = document.createElement('div');
  document.body.appendChild(host);
  const root = createRoot(host);
  await act(async () => {
    root.render(<Probe token={token} />);
  });
  cleanups.push(() => {
    root.unmount();
    host.remove();
  });
}

afterEach(() => {
  while (cleanups.length) cleanups.pop()!();
  vi.mocked(getSubmissionStatus).mockClear();
});

describe('useStudioStatusPoll', () => {
  it('asks for the reader language, so the stage matches the thread', async () => {
    // The card used to show English beside a Polish thread.
    await i18n.changeLanguage('pl');

    await mount('token-1');

    expect(vi.mocked(getSubmissionStatus)).toHaveBeenCalledWith('token-1', 'pl');
  });

  it('re-reads when the reader switches language', async () => {
    await i18n.changeLanguage('en');
    await mount('token-1');
    expect(vi.mocked(getSubmissionStatus)).toHaveBeenCalledWith('token-1', 'en');

    await act(async () => {
      await i18n.changeLanguage('pl');
    });

    expect(vi.mocked(getSubmissionStatus)).toHaveBeenCalledWith('token-1', 'pl');
  });
});
