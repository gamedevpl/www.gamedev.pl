// @vitest-environment jsdom

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import i18n from './i18n/index.js';
import { DimensionToggle, DEFAULT_DIMENSION, type GameDimension } from './DimensionToggle.js';

let container: HTMLDivElement;
let root: Root | null = null;

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
  vi.restoreAllMocks();
});

function draw(value: GameDimension, onChange: (next: GameDimension) => void, disabled = false) {
  act(() => {
    root = createRoot(container);
    root.render(<DimensionToggle value={value} onChange={onChange} disabled={disabled} />);
  });
}

const switchEl = () => container.querySelector<HTMLButtonElement>('.dimension-switch')!;
const sides = () => Array.from(container.querySelectorAll<HTMLButtonElement>('.dimension-side'));

describe('DimensionToggle', () => {
  it('defaults to 2D — the light path, and what every published game already is', () => {
    expect(DEFAULT_DIMENSION).toBe('2d');
  });

  it('renders a switch, not a radiogroup: the two options are not peers', () => {
    draw('2d', () => {});
    expect(switchEl().getAttribute('role')).toBe('switch');
    expect(switchEl().getAttribute('aria-checked')).toBe('false');
    expect(container.querySelector('[role="radiogroup"]')).toBeNull();
  });

  it('reports 3D as the checked state', () => {
    draw('3d', () => {});
    expect(switchEl().getAttribute('aria-checked')).toBe('true');
  });

  it('toggles on click, in both directions', () => {
    const onChange = vi.fn();
    draw('2d', onChange);
    act(() => {
      switchEl().click();
    });
    expect(onChange).toHaveBeenCalledWith('3d');

    onChange.mockClear();
    draw('3d', onChange);
    act(() => {
      switchEl().click();
    });
    expect(onChange).toHaveBeenCalledWith('2d');
  });

  it('sets the value directly when a side label is clicked', () => {
    const onChange = vi.fn();
    draw('2d', onChange);
    act(() => {
      sides()[1].click();
    });
    expect(onChange).toHaveBeenCalledWith('3d');
  });

  // Clicking "2D" while already on 2D must be a no-op, not a flip to 3D — the whole
  // reason the labels set the value instead of toggling it.
  it('does not flip when the already-active label is clicked', () => {
    const onChange = vi.fn();
    draw('2d', onChange);
    act(() => {
      sides()[0].click();
    });
    expect(onChange).toHaveBeenCalledWith('2d');
  });

  it('keeps the side labels out of the tab order and the accessibility tree', () => {
    draw('2d', () => {});
    for (const side of sides()) {
      expect(side.tabIndex).toBe(-1);
      expect(side.getAttribute('aria-hidden')).toBe('true');
    }
  });

  it('marks the active side so the choice is readable without the knob position', () => {
    draw('2d', () => {});
    expect(sides()[0].className).toContain('is-on');
    expect(sides()[1].className).not.toContain('is-on');
  });

  it('moves with the arrow keys, which is what anyone tries on a two-position switch', () => {
    const onChange = vi.fn();
    draw('2d', onChange);

    act(() => {
      switchEl().dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));
    });
    expect(onChange).toHaveBeenCalledWith('3d');

    onChange.mockClear();
    act(() => {
      switchEl().dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowLeft', bubbles: true }));
    });
    expect(onChange).toHaveBeenCalledWith('2d');
  });

  // Mid-submission the dimension is already on its way to the agent; letting it move
  // would show a state the brief does not match.
  it('disables every target while a submission is in flight', () => {
    draw('2d', () => {}, true);
    expect(switchEl().disabled).toBe(true);
    for (const side of sides()) expect(side.disabled).toBe(true);
  });
});
