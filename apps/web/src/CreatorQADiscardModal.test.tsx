// @vitest-environment jsdom

import { act, createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { CreatorQADiscardModal } from './CreatorQADiscardModal.js';
import { i18nReady } from './i18n/index.js';

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

describe('CreatorQADiscardModal', () => {
  beforeEach(async () => {
    await i18nReady;
  });
  it('restores focus to opener on keep click, backdrop click, and Escape', async () => {
    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = createRoot(container);

    const opener = document.createElement('button');
    document.body.appendChild(opener);

    let keepCount = 0;
    const onKeep = () => {
      keepCount++;
    };

    await act(async () => {
      root.render(
        createElement(CreatorQADiscardModal, {
          onKeep,
          onDiscard: vi.fn(),
          openerElement: opener,
        }),
      );
    });

    const keepBtn = container.querySelector<HTMLButtonElement>('.qa-confirm-keep')!;
    await act(async () => {
      keepBtn.click();
    });
    expect(keepCount).toBe(1);
    expect(document.activeElement).toBe(opener);

    const backdrop = container.querySelector<HTMLDivElement>('.qa-confirm-backdrop')!;
    await act(async () => {
      backdrop.click();
    });
    expect(keepCount).toBe(2);
    expect(document.activeElement).toBe(opener);

    await act(async () => {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    });
    expect(keepCount).toBe(3);
    expect(document.activeElement).toBe(opener);

    await act(async () => {
      root.unmount();
    });
    container.remove();
    opener.remove();
  });

  it('calls onDiscard and avoids refocusing opener on discard', async () => {
    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = createRoot(container);

    const opener = document.createElement('button');
    document.body.appendChild(opener);

    let discarded = false;
    const onDiscard = () => {
      discarded = true;
    };

    await act(async () => {
      root.render(
        createElement(CreatorQADiscardModal, {
          onKeep: vi.fn(),
          onDiscard,
          openerElement: opener,
        }),
      );
    });

    const discardBtn = container.querySelector<HTMLButtonElement>('.qa-confirm-discard')!;
    await act(async () => {
      discardBtn.click();
    });
    expect(discarded).toBe(true);

    await act(async () => {
      root.unmount();
    });
    container.remove();
    opener.remove();
  });
});
