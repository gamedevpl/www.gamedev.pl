// @vitest-environment jsdom

import { act, createElement, type MutableRefObject } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { CatalogEntry } from '../../catalog.js';
import { BRIDGE_NAMESPACE, PROTOCOL_VERSION, type RoomPhase } from '../../mp/protocol.js';
import { PartyStage } from './PartyStage.js';
import type { PartySession } from './mpApi.js';

const setPhase = vi.fn();
vi.mock('./roomClient.js', () => ({
  RoomClient: vi.fn().mockImplementation((opts: { onStatus?: (status: string) => void }) => {
    opts.onStatus?.('connected');
    return { connect: () => undefined, close: () => undefined, setPhase, kick: () => undefined };
  }),
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
    return { frame, posted };
  }

  it('commands the game to start, so the lobby is the only front door', () => {
    const { frame, posted } = startRound();
    act(() => bridgeMessage(frame, { t: 'hello', slots: 4 }));
    expect(posted).toContainEqual(expect.objectContaining({ t: 'command', cmd: 'start' }));
  });

  it('relays every phase the game reports to the phones', () => {
    const { frame } = startRound();
    for (const phase of ['paused', 'playing', 'ended'] as RoomPhase[]) {
      act(() => bridgeMessage(frame, { t: 'phase', phase }));
      expect(setPhase).toHaveBeenLastCalledWith(phase);
    }
  });

  it('leaves the ended phase with the restart, not a frame later', () => {
    // The relay refuses guests while a room is ended, so a phone that dropped on the
    // end screen could not come back for the round the host just restarted.
    const { frame } = startRound();
    act(() => bridgeMessage(frame, { t: 'phase', phase: 'ended' }));
    expect(setPhase).toHaveBeenLastCalledWith('ended');

    act(() => {
      (container.querySelector('.party-play-controls .party-life-btn:nth-child(2)') as HTMLButtonElement).click();
    });
    expect(setPhase).toHaveBeenLastCalledWith('playing');
  });

  it('returns the room to the QR lobby when the game leaves its round', () => {
    const { frame } = startRound();
    expect(container.querySelector('.party-playing')).not.toBeNull();
    act(() => bridgeMessage(frame, { t: 'phase', phase: 'lobby' }));
    expect(container.querySelector('.party-playing')).toBeNull();
    expect(container.querySelector('.party-lobby')).not.toBeNull();
  });
});
