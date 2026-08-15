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
        }),
      );
    });

    const picker = container.querySelector<HTMLInputElement>('.cm-color-picker');
    expect(picker).not.toBeNull();
    expect(picker?.value).toBe('#abcd12');

    await act(async () => {
      const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')!.set!;
      setter.call(picker, '#112233');
      picker!.dispatchEvent(new Event('change', { bubbles: true }));
    });

    expect(onChange).toHaveBeenCalledWith("const color = '#11223334';");
  });
});
