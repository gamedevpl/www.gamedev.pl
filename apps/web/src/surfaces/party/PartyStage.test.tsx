// @vitest-environment jsdom

import { act, createElement, type MutableRefObject } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { CatalogEntry } from '../../catalog.js';
import { BRIDGE_NAMESPACE, PROTOCOL_VERSION, type RoomPhase } from '../../mp/protocol.js';
import { recordPartyStep } from '../../visitTelemetry.js';
import { PartyStage } from './PartyStage.js';
import type { PartySession } from './mpApi.js';

const setPhase = vi.fn();
vi.mock('./roomClient.js', () => ({
  RoomClient: vi.fn().mockImplementation(function (opts: { onStatus?: (status: string) => void }) {
    opts.onStatus?.('connected');
    return { connect: () => undefined, close: () => undefined, setPhase, kick: () => undefined };
  }),
}));

vi.mock('../../visitTelemetry.js', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../visitTelemetry.js')>()),
  recordPartyStep: vi.fn(),
}));

// This stand-in only has to carry a contentWindow.
vi.mock('../../PublishedGameFrame.js', () => ({
  PublishedGameFrame: ({ frameRef }: { frameRef: MutableRefObject<HTMLIFrameElement | null> }) =>
    createElement('iframe', { ref: frameRef, title: 'game' }),
}));

const GAME = { slug: 'arena-tag', title: 'Arena Tag', controls: '', multiplayer: { minPlayers: 2 } } as CatalogEntry;
const SESSION = { code: 'ABCD', hostToken: 'token', maxPlayers: 4 } as PartySession;

function bridgeMessage(frame: HTMLIFrameElement, data: Record<string, unknown>) {
  window.dispatchEvent(
    new MessageEvent('message', {
      data: { ns: BRIDGE_NAMESPACE, v: PROTOCOL_VERSION, ...data },
      source: frame.contentWindow,
    }),
  );
}

describe('PartyStage lifecycle', () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
    setPhase.mockClear();
    vi.mocked(recordPartyStep).mockClear();
  });

  afterEach(() => {
    act(() => root.unmount());
    document.body.removeChild(container);
  });

  function startRound() {
    act(() => {
      root.render(createElement(PartyStage, { game: GAME, session: SESSION, onExit: () => undefined }));
    });
    act(() => {
      (container.querySelector('.party-actions .primary-btn') as HTMLButtonElement).click();
    });
    const frame = container.querySelector('iframe') as HTMLIFrameElement;
    const posted: Array<Record<string, unknown>> = [];
    vi.spyOn(frame.contentWindow as Window, 'postMessage').mockImplementation((message: unknown) => {
      posted.push(message as Record<string, unknown>);
    });
    // The game boots, says hello, and answers the start with a round.
    act(() => bridgeMessage(frame, { t: 'hello', slots: 4 }));
    act(() => bridgeMessage(frame, { t: 'phase', phase: 'playing' }));
    return { frame, posted };
  }

  it('commands the game to start, so the lobby is the only front door', () => {
    const { posted } = startRound();
    expect(posted).toContainEqual(expect.objectContaining({ t: 'command', cmd: 'start' }));
  });

  it('stays in the round when the booting game reports its own menu first', () => {
    // The game says `lobby` before it has read the start command.
    act(() => {
      root.render(createElement(PartyStage, { game: GAME, session: SESSION, onExit: () => undefined }));
    });
    act(() => (container.querySelector('.party-actions .primary-btn') as HTMLButtonElement).click());
    const frame = container.querySelector('iframe') as HTMLIFrameElement;
    act(() => bridgeMessage(frame, { t: 'hello', slots: 4 }));
    act(() => bridgeMessage(frame, { t: 'phase', phase: 'lobby' }));

    expect(container.querySelector('.party-playing')).not.toBeNull();
    expect(setPhase).not.toHaveBeenCalledWith('lobby');
  });

  it('relays every phase the game reports to the phones', () => {
    const { frame } = startRound();
    for (const phase of ['paused', 'playing', 'ended'] as RoomPhase[]) {
      act(() => bridgeMessage(frame, { t: 'phase', phase }));
      expect(setPhase).toHaveBeenLastCalledWith(phase);
    }
  });

  it('leaves the ended phase with the restart, not a frame later', () => {
    // A room stays ended, and the relay refuses guests there.
    const { frame } = startRound();
    act(() => bridgeMessage(frame, { t: 'phase', phase: 'ended' }));
    expect(setPhase).toHaveBeenLastCalledWith('ended');

    act(() => {
      (container.querySelector('.party-play-controls .party-life-btn:nth-child(2)') as HTMLButtonElement).click();
    });
    expect(setPhase).toHaveBeenLastCalledWith('playing');
  });

  it('credits the bar for both commands when two are in flight at once', () => {
    // Pause then restart before either echo lands.
    const { frame } = startRound();
    const buttons = container.querySelectorAll('.party-play-controls .party-life-btn');
    act(() => (buttons[0] as HTMLButtonElement).click());
    act(() => (buttons[1] as HTMLButtonElement).click());

    act(() => bridgeMessage(frame, { t: 'phase', phase: 'paused' }));
    act(() => bridgeMessage(frame, { t: 'phase', phase: 'playing' }));

    const seatSteps = vi.mocked(recordPartyStep).mock.calls.filter(([, via]) => via === 'seat');
    expect(seatSteps).toEqual([]);
  });

  it('reads a phase nobody commanded as a seat, even after a stale command', () => {
    const { frame } = startRound();
    // An unanswered command must not swallow a later seat phase.
    act(() => (container.querySelectorAll('.party-play-controls .party-life-btn')[1] as HTMLButtonElement).click());
    act(() => bridgeMessage(frame, { t: 'phase', phase: 'paused' }));

    expect(vi.mocked(recordPartyStep)).toHaveBeenCalledWith('paused', 'seat');
  });

  it('returns the room to the QR lobby when the game leaves its round', () => {
    const { frame } = startRound();
    expect(container.querySelector('.party-playing')).not.toBeNull();
    act(() => bridgeMessage(frame, { t: 'phase', phase: 'lobby' }));
    expect(container.querySelector('.party-playing')).toBeNull();
    expect(container.querySelector('.party-lobby')).not.toBeNull();
  });
});
