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

async function redraw(props: Partial<Parameters<typeof HowToPlayPanel>[0]> = {}) {
  act(() => {
    root?.unmount();
  });
  root = null;
  return draw(props);
}

/** The panel portals to document.body, so queries go there rather than to `container`. */
function card() {
  return document.querySelector('.howto-card');
}

function rows() {
  return [...document.querySelectorAll('.howto-row')].map((row) => [
    row.querySelector('dt')?.textContent ?? '',
    row.querySelector('dd')?.textContent ?? '',
  ]);
}

describe('HowToPlayPanel', () => {
  it('renders each control as a key/action pair', async () => {
    await draw();
    expect(rows()).toEqual([
      ['A/D or Left/Right', 'steer'],
      ['W/Up', 'accelerate'],
      ['M', 'mute'],
    ]);
  });

  it('gives a clause it cannot split a full-width row instead of guessing', async () => {
    await draw({ controls: 'Press A, S, D, F, or Space in sync with scrolling rhythm note prompts' });
    const row = document.querySelector('.howto-row');
    expect(row?.classList.contains('is-wide')).toBe(true);
    expect(row?.querySelector('dt')).toBeNull();
  });

  it('is a labelled modal dialog', async () => {
    await draw();
    expect(card()?.getAttribute('role')).toBe('dialog');
    expect(card()?.getAttribute('aria-modal')).toBe('true');
    const labelledBy = card()?.getAttribute('aria-labelledby');
    expect(labelledBy).toBeTruthy();
    expect(document.getElementById(labelledBy!)?.textContent).toContain('How to play');
    // The game is named in the close button rather than shown as a subtitle: the theater
    // bar behind the card already carries the title.
    expect(document.querySelector('.howto-close')?.getAttribute('aria-label')).toContain('Apex Sprint');
    expect(document.querySelector('.howto-dismiss')?.textContent).toContain('close');
  });

  it('renders nothing when closed, and nothing when the game has no controls', async () => {
    await draw({ open: false });
    expect(card()).toBeNull();

    await redraw({ controls: '   ' });
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

  it('keeps Tab inside the card — aria-modal does not constrain focus on its own', async () => {
    await draw();
    const close = document.querySelector('.howto-close') as HTMLButtonElement;
    // A button behind the backdrop, of the kind the theater bar renders.
    const outside = document.createElement('button');
    document.body.appendChild(outside);

    const forward = new KeyboardEvent('keydown', { key: 'Tab', bubbles: true, cancelable: true });
    await act(async () => {
      window.dispatchEvent(forward);
    });
    // Only one stop in the card, so Tab wraps back onto it rather than leaving.
    expect(forward.defaultPrevented).toBe(true);
    expect(document.activeElement).toBe(close);

    const back = new KeyboardEvent('keydown', { key: 'Tab', shiftKey: true, bubbles: true, cancelable: true });
    await act(async () => {
      window.dispatchEvent(back);
    });
    expect(back.defaultPrevented).toBe(true);
    expect(document.activeElement).toBe(close);

    outside.remove();
  });

  it('adds the keyboard-only note only for games with no touch path', async () => {
    await draw();
    expect(document.querySelector('.howto-note')).toBeNull();

    await redraw({ keyboardOnly: true });
    expect(document.querySelector('.howto-note')?.textContent).toContain('keyboard');
  });

  it('renders repeated clauses without a duplicate-key warning', async () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    await draw({ controls: 'Space to jump; Space to jump' });
    expect(rows()).toHaveLength(2);
    expect(consoleError.mock.calls.flat().join(' ')).not.toContain('same key');
    consoleError.mockRestore();
  });

  it('renders agent-authored control text as literal text, never as markup', async () => {
    await draw({ controls: '<img src=x onerror=alert(1)> to jump' });
    expect(document.querySelector('.howto-keys img')).toBeNull();
    expect(rows()).toEqual([['<img src=x onerror=alert(1)>', 'jump']]);
  });
});
