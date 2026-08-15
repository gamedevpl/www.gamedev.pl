// @vitest-environment jsdom

import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { NumberScrubber, type NumberScrubberProps } from './NumberScrubber.js';

describe('NumberScrubber', () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
    // jsdom does not implement pointer capture; the component must tolerate its absence.
    if (!HTMLElement.prototype.setPointerCapture) {
      HTMLElement.prototype.setPointerCapture = () => {};
    }
  });

  afterEach(async () => {
    await act(async () => root.unmount());
    container.remove();
  });

  function render(props: Partial<NumberScrubberProps> = {}) {
    const onChange = vi.fn();
    const full: NumberScrubberProps = {
      value: 4,
      min: 1,
      max: 10,
      step: 1,
      onChange,
      ariaLabel: 'Speed',
      ...props,
    };
    act(() => {
      root.render(createElement(NumberScrubber, full));
    });
    return { onChange, el: container.querySelector('[role="slider"]') as HTMLDivElement };
  }

  it('shows the current value and its aria bounds', () => {
    const { el } = render({ value: 4, min: 1, max: 10 });
    expect(el.textContent).toBe('4');
    expect(el.getAttribute('aria-valuemin')).toBe('1');
    expect(el.getAttribute('aria-valuemax')).toBe('10');
    expect(el.getAttribute('aria-valuenow')).toBe('4');
  });

  it('formats the displayed value when a formatter is given', () => {
    const { el } = render({ value: 4, formatValue: (v) => `${v}x` });
    expect(el.textContent).toBe('4x');
  });

  it('nudges by step on ArrowRight/ArrowLeft, clamped to the range', () => {
    const { el, onChange } = render({ value: 9, min: 1, max: 10, step: 1 });
    act(() => {
      el.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));
    });
    expect(onChange).toHaveBeenLastCalledWith(10);

    const { el: el2, onChange: onChange2 } = render({ value: 1, min: 1, max: 10, step: 1 });
    act(() => {
      el2.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowLeft', bubbles: true }));
    });
    expect(onChange2).toHaveBeenLastCalledWith(1);
  });

  it('takes a coarser step with Shift held', () => {
    const { el, onChange } = render({ value: 5, min: 1, max: 100, step: 1 });
    act(() => {
      el.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', shiftKey: true, bubbles: true }));
    });
    expect(onChange).toHaveBeenLastCalledWith(15);
  });

  it('does nothing on keyboard input while disabled', () => {
    const { el, onChange } = render({ value: 5, disabled: true });
    act(() => {
      el.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));
    });
    expect(onChange).not.toHaveBeenCalled();
    expect(el.getAttribute('tabindex')).toBe('-1');
  });

  it('scrubs via pointer drag, scaled by pixels-per-step, and clamps at the max', () => {
    const { el, onChange } = render({ value: 4, min: 1, max: 10, step: 1 });
    act(() => {
      el.dispatchEvent(new PointerEvent('pointerdown', { pointerId: 1, clientX: 100, button: 0, bubbles: true }));
      el.dispatchEvent(new PointerEvent('pointermove', { pointerId: 1, clientX: 140, bubbles: true }));
    });
    // 40px at 4px/step clamps 4 to the max of 10.
    expect(onChange).toHaveBeenLastCalledWith(10);
  });
});
