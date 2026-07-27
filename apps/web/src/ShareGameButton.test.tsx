// @vitest-environment jsdom

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import i18n from './i18n/index.js';
import { ShareGameButton } from './ShareGameButton.js';

let container: HTMLDivElement;
let root: Root | null = null;

beforeEach(async () => {
  (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  await i18n.changeLanguage('en');
  container = document.createElement('div');
  document.body.appendChild(container);
  window.history.replaceState(null, '', '/play/brick-storm');
});

afterEach(() => {
  act(() => {
    root?.unmount();
  });
  root = null;
  container.remove();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

function draw() {
  root = createRoot(container);
  act(() => {
    root!.render(<ShareGameButton slug="brick-storm" title="Brick Storm" />);
  });
  return container.querySelector('button')!;
}

describe('ShareGameButton', () => {
  it('prefers the OS share sheet when the browser offers one', async () => {
    const share = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal('navigator', { ...navigator, share, canShare: () => true, clipboard: navigator.clipboard });

    const button = draw();
    await act(async () => {
      button.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    expect(share).toHaveBeenCalledWith(
      expect.objectContaining({
        title: 'Brick Storm',
        url: expect.stringMatching(/\/play\/brick-storm$/),
      }),
    );
  });

  it('copies the play permalink when share is unavailable', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal('navigator', {
      ...navigator,
      share: undefined,
      clipboard: { writeText },
    });

    const button = draw();
    await act(async () => {
      button.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    expect(writeText).toHaveBeenCalledWith(expect.stringMatching(/\/play\/brick-storm$/));
    expect(button.getAttribute('aria-label')).toMatch(/copied/i);
  });
});
