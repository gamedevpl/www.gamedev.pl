// @vitest-environment jsdom

import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CodeSurfaceAgentMode } from './CodeSurfaceAgentMode.js';

describe('CodeSurfaceAgentMode', () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
  });

  async function render(open: boolean) {
    await act(async () => {
      root.render(
        createElement(CodeSurfaceAgentMode, {
          slug: 'demo',
          open,
          enabled: true,
          onToggle: vi.fn(),
          onClose: vi.fn(),
        }),
      );
    });
  }

  // Closing used to unmount the dialog, discarding a prepared command.
  it('keeps a typed command across a close and reopen', async () => {
    await render(true);
    const input = container.querySelector<HTMLTextAreaElement>('.code-surface-agent-console-input')!;
    expect(input).not.toBeNull();

    await act(async () => {
      const setter = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, 'value')!.set!;
      setter.call(input, '{"tool":"patch_source_file","input":{}}');
      input.dispatchEvent(new Event('input', { bubbles: true }));
    });

    await render(false);
    expect(container.querySelector('.code-surface-agent-console-input')).toBeNull();

    await render(true);
    expect(container.querySelector<HTMLTextAreaElement>('.code-surface-agent-console-input')?.value).toBe(
      '{"tool":"patch_source_file","input":{}}',
    );
  });

  it('renders nothing while closed', async () => {
    await render(false);
    expect(container.querySelector('.code-surface-agent-mode-backdrop')).toBeNull();
  });
});
