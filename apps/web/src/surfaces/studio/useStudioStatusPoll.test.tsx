// @vitest-environment jsdom

import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../submissionApi.js', () => ({
  getSubmissionStatus: vi.fn(async () => ({ status: 'building' })),
}));

import i18n from '../../i18n/index.js';
import { getSubmissionStatus } from '../../submissionApi.js';
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

  it('polls again the moment a backgrounded tab is looked at', async () => {
    // A backgrounded tab's setTimeout gets throttled by the browser, sometimes for
    // minutes — long enough for a self-build round to finish unwatched.
    await mount('token-1');
    expect(vi.mocked(getSubmissionStatus)).toHaveBeenCalledTimes(1);

    const spy = vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('visible');
    await act(async () => {
      document.dispatchEvent(new Event('visibilitychange'));
    });

    expect(vi.mocked(getSubmissionStatus)).toHaveBeenCalledTimes(2);
    spy.mockRestore();
  });

  it('does nothing when the tab goes the other way, into the background', async () => {
    await mount('token-1');
    expect(vi.mocked(getSubmissionStatus)).toHaveBeenCalledTimes(1);

    const spy = vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('hidden');
    await act(async () => {
      document.dispatchEvent(new Event('visibilitychange'));
    });

    expect(vi.mocked(getSubmissionStatus)).toHaveBeenCalledTimes(1);
    spy.mockRestore();
  });

  it('polls again on window focus, for a sleep/wake that never toggled visibility', async () => {
    // Sleep/wake can leave the tab "visible" with no edge to catch.
    await mount('token-1');
    expect(vi.mocked(getSubmissionStatus)).toHaveBeenCalledTimes(1);

    await act(async () => {
      window.dispatchEvent(new Event('focus'));
    });

    expect(vi.mocked(getSubmissionStatus)).toHaveBeenCalledTimes(2);
  });

  it('polls again on pageshow, for a bfcache restore', async () => {
    await mount('token-1');
    expect(vi.mocked(getSubmissionStatus)).toHaveBeenCalledTimes(1);

    await act(async () => {
      window.dispatchEvent(new Event('pageshow'));
    });

    expect(vi.mocked(getSubmissionStatus)).toHaveBeenCalledTimes(2);
  });
});
