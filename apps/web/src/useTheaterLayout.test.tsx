// @vitest-environment jsdom

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { useRef } from 'react';
import { useAgentViewportTrack, useTheaterMidWidth, useTheaterNarrow } from './useTheaterLayout.js';

let container: HTMLDivElement;
let root: Root | null = null;

beforeEach(() => {
  (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  container = document.createElement('div');
  document.body.appendChild(container);
});

afterEach(() => {
  act(() => {
    root?.unmount();
  });
  root = null;
  container.remove();
  delete (window as unknown as Record<string, unknown>).matchMedia;
  Reflect.deleteProperty(window, 'visualViewport');
});

function stubViewport(width: number) {
  (window as unknown as Record<string, unknown>).matchMedia = (query: string) => {
    const min = Number(/min-width:\s*(\d+)px/.exec(query)?.[1] ?? 0);
    const max = Number(/max-width:\s*(\d+)px/.exec(query)?.[1] ?? Number.POSITIVE_INFINITY);
    return {
      matches: width >= min && width <= max,
      addEventListener: () => undefined,
      removeEventListener: () => undefined,
    };
  };
}

function NarrowProbe({ agentOpen }: { agentOpen: boolean }) {
  const narrow = useTheaterNarrow(agentOpen);
  const mid = useTheaterMidWidth(agentOpen);
  return <div data-narrow={narrow ? '1' : '0'} data-mid={mid ? '1' : '0'} />;
}

function ViewportProbe({ enabled }: { enabled: boolean }) {
  const ref = useRef<HTMLDivElement | null>(null);
  const tracked = useAgentViewportTrack(enabled, ref);
  return <div ref={ref} data-tracked={tracked ? '1' : '0'} />;
}

describe('theater layout breakpoints', () => {
  it('compacts when the agent rail leaves a phone-narrow bar', async () => {
    stubViewport(1000);
    root = createRoot(container);
    await act(async () => {
      root!.render(<NarrowProbe agentOpen />);
    });
    const el = container.querySelector('div') as HTMLElement;
    expect(el.dataset.narrow).toBe('1');
    expect(el.dataset.mid).toBe('1');
  });

  it('keeps desktop chrome when the leftover bar is still wide', async () => {
    stubViewport(1440);
    root = createRoot(container);
    await act(async () => {
      root!.render(<NarrowProbe agentOpen />);
    });
    const el = container.querySelector('div') as HTMLElement;
    expect(el.dataset.narrow).toBe('0');
    expect(el.dataset.mid).toBe('0');
  });

  it('does not compact a wide window without the agent rail', async () => {
    stubViewport(1000);
    root = createRoot(container);
    await act(async () => {
      root!.render(<NarrowProbe agentOpen={false} />);
    });
    const el = container.querySelector('div') as HTMLElement;
    expect(el.dataset.narrow).toBe('0');
    expect(el.dataset.mid).toBe('0');
  });
});

describe('agent visual viewport tracking', () => {
  it('writes height and offset onto the stage node', async () => {
    const listeners = new Map<string, Set<() => void>>();
    const viewport = {
      height: 400,
      offsetTop: 12,
      addEventListener: (type: string, listener: () => void) => {
        if (!listeners.has(type)) listeners.set(type, new Set());
        listeners.get(type)!.add(listener);
      },
      removeEventListener: (type: string, listener: () => void) => listeners.get(type)?.delete(listener),
    };
    Object.defineProperty(window, 'visualViewport', { value: viewport, configurable: true, writable: true });

    root = createRoot(container);
    await act(async () => {
      root!.render(<ViewportProbe enabled />);
    });
    const el = container.querySelector('div') as HTMLElement;
    expect(el.dataset.tracked).toBe('1');
    expect(el.style.getPropertyValue('--agent-visual-height')).toBe('400px');
    expect(el.style.getPropertyValue('--agent-visual-offset')).toBe('12px');
  });
});
