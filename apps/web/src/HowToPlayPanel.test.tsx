// @vitest-environment jsdom

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import i18n from './i18n/index.js';
import { HowToPlayPanel } from './HowToPlayPanel.js';

let container: HTMLDivElement;
let root: Root | null = null;

const CONTROLS = 'A/D or Left/Right to steer; W/Up to accelerate; M to mute';

beforeEach(async () => {
  (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  await i18n.changeLanguage('en');
  container = document.createElement('div');
  document.body.appendChild(container);
});

afterEach(() => {
  act(() => {
    root?.unmount();
  });
  root = null;
  container.remove();
});

async function draw(props: Partial<Parameters<typeof HowToPlayPanel>[0]> = {}) {
  const onClose = vi.fn();
  root = createRoot(container);
  await act(async () => {
    root!.render(<HowToPlayPanel open controls={CONTROLS} gameTitle="Apex Sprint" onClose={onClose} {...props} />);
  });
  return { onClose };
}

/** The panel portals to document.body, so queries go there rather than to `container`. */
function card() {
  return document.querySelector('.howto-card');
}

describe('HowToPlayPanel', () => {
  it('renders one row per control clause', async () => {
    await draw();
    const rows = [...document.querySelectorAll('.howto-list li')].map((li) => li.textContent);
    expect(rows).toEqual(['A/D or Left/Right to steer', 'W/Up to accelerate', 'M to mute']);
  });

  it('is a labelled modal dialog', async () => {
    await draw();
    expect(card()?.getAttribute('role')).toBe('dialog');
    expect(card()?.getAttribute('aria-modal')).toBe('true');
    const labelledBy = card()?.getAttribute('aria-labelledby');
    expect(labelledBy).toBeTruthy();
    expect(document.getElementById(labelledBy!)?.textContent).toContain('How to play');
    expect(document.querySelector('.howto-game')?.textContent).toBe('Apex Sprint');
  });

  it('renders nothing when closed, and nothing when the game has no controls', async () => {
    await draw({ open: false });
    expect(card()).toBeNull();

    act(() => {
      root?.unmount();
    });
    root = null;
    await draw({ controls: '   ' });
    expect(card()).toBeNull();
  });

  it('closes on the close button and on a backdrop click, but not on a click inside the card', async () => {
    const { onClose } = await draw();

    await act(async () => {
      document.querySelector('.howto-close')?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
    expect(onClose).toHaveBeenCalledTimes(1);

    await act(async () => {
      card()?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
    expect(onClose).toHaveBeenCalledTimes(1);

    await act(async () => {
      document.querySelector('.howto-backdrop')?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
    expect(onClose).toHaveBeenCalledTimes(2);
  });

  it('takes focus when it opens so the card is keyboard-reachable', async () => {
    await draw();
    expect(document.activeElement).toBe(document.querySelector('.howto-close'));
  });

  it('adds the keyboard-only note only for games with no touch path', async () => {
    await draw();
    expect(document.querySelector('.howto-note')).toBeNull();

    act(() => {
      root?.unmount();
    });
    root = null;
    await draw({ keyboardOnly: true });
    expect(document.querySelector('.howto-note')?.textContent).toContain('keyboard');
  });

  it('renders agent-authored control text as literal text, never as markup', async () => {
    await draw({ controls: '<img src=x onerror=alert(1)> to jump' });
    expect(document.querySelector('.howto-list img')).toBeNull();
    expect(document.querySelector('.howto-list li')?.textContent).toBe('<img src=x onerror=alert(1)> to jump');
  });
});
