// @vitest-environment jsdom

import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';
import i18n from '../../i18n/index.js';
import { FeedbackPanel, type ComposerDraft } from './FeedbackPanel.js';

const submitFeedback = vi.fn();

vi.mock('../../submissionApi.js', async () => {
  const actual = await vi.importActual<typeof import('../../submissionApi.js')>('../../submissionApi.js');
  return { ...actual, submitFeedback: (...args: unknown[]) => submitFeedback(...args) };
});

const roots: Array<{ unmount: () => void }> = [];

afterEach(() => {
  roots.splice(0).forEach((root) => act(() => root.unmount()));
  document.body.innerHTML = '';
  vi.clearAllMocks();
});

function sendButton(container: HTMLElement): HTMLButtonElement {
  const match = container.querySelector<HTMLButtonElement>('.status-composer-send');
  if (!match) throw new Error('no send button');
  return match;
}

async function mount() {
  (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  await i18n.changeLanguage('en');
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root = createRoot(container);
  roots.push(root);
  const render = (draft: ComposerDraft) =>
    act(() => {
      root.render(
        <FeedbackPanel token="t" published={false} building compact draft={draft} onSent={() => undefined} />,
      );
    });
  return { container, render };
}

describe('FeedbackPanel draft handling', () => {
  it('keeps a proposal picked while the previous request is still sending', async () => {
    let settle = (): void => undefined;
    submitFeedback.mockReturnValue(
      new Promise((resolve) => {
        settle = () => resolve({ roundStarted: true });
      }),
    );
    const { container, render } = await mount();
    await render({ text: 'Make the enemies much slower please.', seq: 1 });

    await act(async () => {
      sendButton(container).click();
    });

    // Still live while the request is out; a pick reseeds it.
    await render({ text: 'Make the level happen at night instead.', seq: 2 });

    await act(async () => {
      settle();
      await Promise.resolve();
    });

    const input = container.querySelector('textarea');
    expect(input?.value).toBe('Make the level happen at night instead.');
  });

  it('clears the box when nothing was picked during the send', async () => {
    submitFeedback.mockResolvedValue({ roundStarted: true });
    const { container, render } = await mount();
    await render({ text: 'Make the enemies much slower please.', seq: 1 });

    await act(async () => {
      sendButton(container).click();
      await Promise.resolve();
    });

    expect(container.querySelector('textarea')?.value).toBe('');
  });
});
