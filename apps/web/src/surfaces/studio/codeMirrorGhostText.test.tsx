// @vitest-environment jsdom

import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import CodeMirrorEditor from './CodeMirrorEditor.js';

describe('ghost text accept affordance', () => {
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

  // The iOS accept target must carry real button semantics, not role="button".
  it('offers the accept affordance as a native button outside the tab order', async () => {
    const fetchGhostText = vi.fn(async () => ' = 2;');
    const onChange = vi.fn();

    async function render(value: string) {
      await act(async () => {
        root.render(
          createElement(CodeMirrorEditor, { value, language: 'typescript', onChange, diagnostics: [], fetchGhostText }),
        );
      });
    }

    await render('const boot');
    // Only a doc change arms the debounced fetch.
    await render('const boot ');
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 400));
    });

    expect(fetchGhostText).toHaveBeenCalled();
    const accept = container.querySelector('.cm-ghost-text-accept');
    expect(accept).not.toBeNull();
    expect(accept?.tagName).toBe('BUTTON');
    expect(accept?.getAttribute('type')).toBe('button');
    // A focusable control here would compete with Tab, which already accepts.
    expect((accept as HTMLButtonElement).tabIndex).toBe(-1);
    expect(accept?.getAttribute('role')).toBeNull();
  });
});
