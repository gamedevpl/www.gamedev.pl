// @vitest-environment jsdom

import { act, type MutableRefObject } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { dispatchFromFrame } from './test-utils/frameMessage.js';

const recorded: Array<{ type: string }> = [];
vi.mock('./telemetry.js', () => ({
  isPlayTimeAccruing: () => true,
  TelemetrySession: class {
    record(event: { type: string }) {
      recorded.push(event);
    }
    flush() {}
    close() {}
  },
}));
vi.mock('./visitTelemetry.js', () => ({ recordVisitEvent: vi.fn() }));

import { useCreatorPlaytest, useGameTelemetry } from './gamePlayer.js';

let latest: ReturnType<typeof useCreatorPlaytest> | null = null;
function Harness({ frameRef }: { frameRef: MutableRefObject<HTMLIFrameElement | null> }) {
  latest = useCreatorPlaytest(frameRef, true);
  useGameTelemetry('test-game', frameRef, true);
  return null;
}

let root: Root | null = null;
let container: HTMLDivElement;
afterEach(() => {
  act(() => root?.unmount());
  root = null;
  container?.remove();
  latest = null;
  recorded.length = 0;
});

describe('game frame message binding', () => {
  it('ignores another source and another origin in playtest and telemetry', () => {
    (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    const gameWindow = { postMessage: vi.fn() } as unknown as Window;
    const frameRef = { current: { contentWindow: gameWindow } as HTMLIFrameElement };
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
    act(() => root!.render(<Harness frameRef={frameRef} />));
    recorded.length = 0;

    const message = { source: 'gdpl-player', type: 'error', message: 'from game' };
    act(() => dispatchFromFrame({}, message));
    expect(latest!.instrumentation.errors).toEqual([]);
    expect(recorded).toEqual([]);

    act(() => dispatchFromFrame(gameWindow, message, 'https://example.com'));
    expect(latest!.instrumentation.errors).toEqual([]);
    expect(recorded).toEqual([]);

    act(() => dispatchFromFrame(gameWindow, message));
    expect(latest!.instrumentation.errors).toEqual(['from game']);
    expect(recorded).toEqual([{ type: 'error', message: 'from game' }]);
  });
});
