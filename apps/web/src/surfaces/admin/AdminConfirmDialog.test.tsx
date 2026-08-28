// @vitest-environment jsdom

import { act, createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { AdminConfirmDialog } from './AdminConfirmDialog.js';

async function renderDialog(onDismiss = vi.fn(), onConfirm = vi.fn()) {
  (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  const host = document.createElement('div');
  document.body.appendChild(host);
  const root = createRoot(host);
  await act(async () => {
    root.render(
      createElement(AdminConfirmDialog, {
        title: 'Publish Comet Courier?',
        body: 'This goes live on the catalog as comet-courier.',
        confirmLabel: 'Publish',
        onConfirm,
        onDismiss,
      }),
    );
  });
  return { host, root, onDismiss, onConfirm };
}

function dialog(): HTMLElement | null {
  return document.querySelector('.admin-job-confirm');
}

function dialogButton(label: string): HTMLButtonElement {
  return Array.from(dialog()?.querySelectorAll('button') ?? []).find(
    (button) => button.textContent === label,
  ) as HTMLButtonElement;
}

afterEach(() => {
  document.body.innerHTML = '';
});

describe('AdminConfirmDialog', () => {
  it('records the opener on first render and restores it on dismiss', async () => {
    const opener = document.createElement('button');
    opener.textContent = 'Publish';
    document.body.appendChild(opener);
    opener.focus();
    expect(document.activeElement).toBe(opener);

    const { root, onDismiss } = await renderDialog();
    expect(document.activeElement).toBe(dialogButton('Publish'));

    await act(async () => {
      dialogButton('Back').click();
    });
    expect(onDismiss).toHaveBeenCalledTimes(1);

    await act(async () => {
      root.unmount();
    });
    expect(document.activeElement).toBe(opener);
  });

  it('keeps Tab inside the two actions', async () => {
    const opener = document.createElement('button');
    opener.textContent = 'Open';
    document.body.appendChild(opener);
    opener.focus();

    const { root } = await renderDialog();
    const outside = document.createElement('button');
    outside.textContent = 'Behind';
    document.body.appendChild(outside);

    const back = dialogButton('Back');
    const confirm = dialogButton('Publish');
    expect(document.activeElement).toBe(confirm);

    const forward = new KeyboardEvent('keydown', { key: 'Tab', bubbles: true, cancelable: true });
    await act(async () => {
      window.dispatchEvent(forward);
    });
    expect(forward.defaultPrevented).toBe(true);
    expect(document.activeElement).toBe(back);

    const wrapBack = new KeyboardEvent('keydown', { key: 'Tab', shiftKey: true, bubbles: true, cancelable: true });
    await act(async () => {
      window.dispatchEvent(wrapBack);
    });
    expect(wrapBack.defaultPrevented).toBe(true);
    expect(document.activeElement).toBe(confirm);

    outside.focus();
    const fromOutside = new KeyboardEvent('keydown', { key: 'Tab', bubbles: true, cancelable: true });
    await act(async () => {
      window.dispatchEvent(fromOutside);
    });
    expect(fromOutside.defaultPrevented).toBe(true);
    expect(document.activeElement).toBe(back);

    await act(async () => root.unmount());
  });
});
