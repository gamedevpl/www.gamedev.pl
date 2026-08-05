// @vitest-environment jsdom

import { act, createElement, useState } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * The game page keeps the frame mounted while the visitor reads another tab, so a run
 * is not restarted. That makes "is it on screen" a separate question from "is it
 * mounted", and play time must follow the first: a hidden frame that kept beating
 * would inflate focused play time and every scorecard derived from it.
 */

const recorded: Array<{ type: string }> = [];

vi.mock('./telemetry.js', () => ({
  isPlayTimeAccruing: () => true,
  TelemetrySession: class {
    constructor() {
      /* identity is irrelevant here */
    }
    record(event: { type: string }) {
      recorded.push(event);
    }
    flush() {}
    close() {}
  },
}));

vi.mock('./visitTelemetry.js', () => ({ recordVisitEvent: vi.fn() }));

import { useGameTelemetry } from './gamePlayer.js';

const HEARTBEAT_MS = 15_000;

function Harness({ initialActive }: { initialActive: boolean }) {
  const [active, setActive] = useState(initialActive);
  useGameTelemetry('neon-courier', true, undefined, active);
  return createElement('button', { onClick: () => setActive((value) => !value) }, 'toggle');
}

let container: HTMLDivElement;
let root: Root | null = null;

beforeEach(() => {
  (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  recorded.length = 0;
  vi.useFakeTimers();
  container = document.createElement('div');
  document.body.appendChild(container);
});

afterEach(() => {
  act(() => {
    root?.unmount();
  });
  root = null;
  container.remove();
  vi.useRealTimers();
});

function playTimeBeats(): number {
  return recorded.filter((event) => event.type === 'play_time').length;
}

function opens(): number {
  return recorded.filter((event) => event.type === 'game_opened').length;
}

describe('useGameTelemetry while the frame is hidden', () => {
  it('accrues play time only while the frame is on screen', () => {
    root = createRoot(container);
    act(() => {
      root!.render(createElement(Harness, { initialActive: true }));
    });
    expect(opens()).toBe(1);

    act(() => {
      vi.advanceTimersByTime(HEARTBEAT_MS * 2);
    });
    expect(playTimeBeats()).toBe(2);

    // Visitor switches to another tab of the game page — the frame stays mounted.
    act(() => {
      container.querySelector('button')!.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
    act(() => {
      vi.advanceTimersByTime(HEARTBEAT_MS * 4);
    });
    expect(playTimeBeats()).toBe(2);

    // Back to the game: the clock resumes.
    act(() => {
      container.querySelector('button')!.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
    act(() => {
      vi.advanceTimersByTime(HEARTBEAT_MS);
    });
    expect(playTimeBeats()).toBe(3);
  });

  it('does not re-open the session when visibility toggles', () => {
    root = createRoot(container);
    act(() => {
      root!.render(createElement(Harness, { initialActive: true }));
    });

    for (let i = 0; i < 4; i += 1) {
      act(() => {
        container.querySelector('button')!.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      });
    }

    // Tearing the session down and rebuilding it per tab switch would emit a fresh
    // `game_opened` each time, inflating the denominator of every ratio downstream.
    expect(opens()).toBe(1);
  });
});
