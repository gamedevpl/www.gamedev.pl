// @vitest-environment jsdom

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { EditorSurface } from './EditorSurface.js';
import type { EditorControllerState } from '../../editorBridge.js';
import i18n from '../../i18n/index.js';

let root: Root | null = null;
let container: HTMLDivElement | null = null;

beforeEach(async () => {
  (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  await i18n.changeLanguage('en');
});

function controller(overrides: Partial<EditorControllerState> = {}): EditorControllerState {
  return {
    status: 'ready',
    view: { type: 'toolbar', tools: ['brush', 'fill'], active: 'brush' },
    reason: null,
    selected: null,
    pendingChange: null,
    uiRequest: null,
    checks: null,
    canvasBox: null,
    sendEvent: vi.fn(),
    sendSelection: vi.fn(),
    sendUiResult: vi.fn(),
    acknowledgeChange: vi.fn(),
    useFallback: vi.fn(),
    ...overrides,
  };
}

afterEach(() => {
  act(() => root?.unmount());
  root = null;
  container?.remove();
  container = null;
});

describe('EditorSurface', () => {
  it('renders game-authored tools and sends shell events', () => {
    const state = controller();
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
    act(() => root!.render(<EditorSurface controller={state} />));

    const buttons = [...container.querySelectorAll('button')];
    act(() => buttons[1]!.click());
    expect(state.sendEvent).toHaveBeenCalledWith({ type: 'toolSelect', tool: 'fill' });
  });

  it('round-trips a controller confirm request through the shell', () => {
    const state = controller({
      uiRequest: {
        id: 'ui-1',
        spec: { kind: 'confirm', title: 'Clear', message: 'Remove all?' },
      },
    });
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
    act(() => root!.render(<EditorSurface controller={state} />));

    expect(container.textContent).toContain('Remove all?');
    const ok = [...container.querySelectorAll('button')].find((button) => button.textContent === 'OK');
    act(() => ok!.click());
    expect(state.sendUiResult).toHaveBeenCalledWith('ui-1', true);
  });
});
