// @vitest-environment jsdom

import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import CodeMirrorEditor from './CodeMirrorEditor.js';

describe('CodeMirrorEditor color picker', () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    Object.defineProperty(Range.prototype, 'getClientRects', { configurable: true, value: () => [] });
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
  });

  it('renders swatches and replaces the selected color literal', async () => {
    const onChange = vi.fn();

    await act(async () => {
      root.render(
        createElement(CodeMirrorEditor, {
          value: "const color = '#abcd1234';",
          language: 'typescript',
          onChange,
          diagnostics: [],
          colorPickerLabel: 'Choose color',
        }),
      );
    });

    const picker = container.querySelector<HTMLInputElement>('.cm-color-picker');
    expect(picker).not.toBeNull();
    expect(picker?.value).toBe('#abcd12');
    expect(picker?.title).toBe('Choose color #abcd1234');

    await act(async () => {
      const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')!.set!;
      setter.call(picker, '#112233');
      picker!.dispatchEvent(new Event('change', { bubbles: true }));
    });

    expect(onChange).toHaveBeenCalledWith("const color = '#11223334';");

    await act(async () => {
      root.render(
        createElement(CodeMirrorEditor, {
          value: "const color = '#abcd1234';",
          language: 'typescript',
          onChange,
          diagnostics: [],
          colorPickerLabel: 'Wybierz kolor',
        }),
      );
    });

    expect(container.querySelector<HTMLInputElement>('.cm-color-picker')?.getAttribute('aria-label')).toBe(
      'Wybierz kolor #11223334',
    );
  });
});

describe('CodeMirrorEditor external updates', () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    Object.defineProperty(Range.prototype, 'getClientRects', { configurable: true, value: () => [] });
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
  });

  async function render(value: string, onChange: (next: string) => void) {
    await act(async () => {
      root.render(createElement(CodeMirrorEditor, { value, language: 'typescript', onChange, diagnostics: [] }));
    });
  }

  // An agent's rewrite used to need a page reload.
  it('shows a value the parent changed underneath it, without reporting it back as an edit', async () => {
    const onChange = vi.fn();
    await render('export const boot = 1;', onChange);
    expect(container.textContent).toContain('export const boot = 1;');

    await render('export const boot = 2;', onChange);

    expect(container.textContent).toContain('export const boot = 2;');
    // An echo would stage the agent's text as a draft.
    expect(onChange).not.toHaveBeenCalled();
  });

  // Undo must not resurrect text an external update replaced.
  it('does not let Ctrl+Z restore the text an external update replaced', async () => {
    const onChange = vi.fn();
    await render('export const boot = 1;', onChange);
    const editable = container.querySelector<HTMLElement>('[contenteditable="true"]')!;
    // A local edit first, so there is something to undo.
    await act(async () => {
      editable.dispatchEvent(
        new (window as unknown as { InputEvent: typeof InputEvent }).InputEvent('beforeinput', {
          inputType: 'insertText',
          data: 'x',
          bubbles: true,
          cancelable: true,
        }),
      );
    });

    await render('export const boot = 2;', onChange);
    onChange.mockClear();

    await act(async () => {
      editable.dispatchEvent(
        new KeyboardEvent('keydown', { key: 'z', ctrlKey: true, bubbles: true, cancelable: true }),
      );
    });

    expect(container.textContent).toContain('export const boot = 2;');
    expect(onChange).not.toHaveBeenCalled();
  });
});
