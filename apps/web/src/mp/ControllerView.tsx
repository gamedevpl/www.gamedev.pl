import { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { RoomClient, type RoomStatus } from './roomClient.js';
import { useScreenWakeLock } from '../useScreenWakeLock.js';
import type { InputKey, RoomPhase } from './protocol.js';

type ControllerViewProps = { code: string; token: string };

const NICK_ADJECTIVES = ['Swift', 'Brave', 'Sly', 'Wild', 'Calm', 'Bold', 'Lucky', 'Sneaky'];
const NICK_ANIMALS = ['Fox', 'Otter', 'Lynx', 'Crane', 'Bison', 'Moth', 'Heron', 'Wolf'];

function randomNick(): string {
  const adjective = NICK_ADJECTIVES[Math.floor(Math.random() * NICK_ADJECTIVES.length)];
  const animal = NICK_ANIMALS[Math.floor(Math.random() * NICK_ANIMALS.length)];
  return `${adjective} ${animal}`;
}

/**
 * The phone half of the party: a nickname prompt, then a d-pad and one action
 * button. This page is our own trusted shell code — never game code — so it can
 * hold the websocket the sandboxed game is not allowed to open.
 */
export function ControllerView({ code, token }: ControllerViewProps) {
  const { t } = useTranslation();
  const [nick, setNick] = useState(randomNick);
  const [joined, setJoined] = useState(false);
  const [status, setStatus] = useState<RoomStatus>('connecting');
  const [phase, setPhase] = useState<RoomPhase>('lobby');
  const [slot, setSlot] = useState<number | null>(null);
  const [color, setColor] = useState('#00e4ac');
  const [closedReason, setClosedReason] = useState<string | null>(null);
  const clientRef = useRef<RoomClient | null>(null);
  const heldRef = useRef<Set<InputKey>>(new Set());

  useEffect(() => {
    if (!joined) return;

    const client = new RoomClient({
      code,
      token,
      nick,
      onStatus: (next, reason) => {
        setStatus(next);
        if (next === 'closed' && reason) setClosedReason(reason);
        // A reconnect re-seats us; anything we were holding is stale on the new
        // socket, so forget it rather than leaving a phantom key down.
        if (next !== 'connected') heldRef.current.clear();
      },
      onFrame: (frame) => {
        if (frame.t === 'welcome') {
          setSlot(frame.slot);
          setColor(frame.color);
          setPhase(frame.phase);
        }
        if (frame.t === 'phase') setPhase(frame.phase);
        if (frame.t === 'closed') setClosedReason(frame.reason);
      },
    });
    clientRef.current = client;
    client.connect();

    return () => {
      client.close();
      clientRef.current = null;
    };
  }, [joined, code, token, nick]);

  // Keep the screen awake: a controller that sleeps mid-round is the most
  // annoying failure this feature can have.
  useScreenWakeLock(joined);

  const press = useCallback((key: InputKey, value: 0 | 1) => {
    const held = heldRef.current;
    if (value === 1) {
      if (held.has(key)) return;
      held.add(key);
    } else {
      if (!held.has(key)) return;
      held.delete(key);
    }
    clientRef.current?.sendInput(key, value);
    if (value === 1 && 'vibrate' in navigator) navigator.vibrate?.(12);
  }, []);

  if (closedReason) {
    return (
      <div className="controller-screen controller-message">
        <h1>{t(`party.closed.${closedReason}`, { defaultValue: t('party.closed.generic') })}</h1>
        <p>{t('party.controllerClosedHint')}</p>
      </div>
    );
  }

  if (!joined) {
    return (
      <div className="controller-screen controller-join">
        <h1>{t('party.joinTitle')}</h1>
        <p className="controller-room">{code}</p>
        <label className="controller-label" htmlFor="party-nick">
          {t('party.nickLabel')}
        </label>
        <input
          id="party-nick"
          className="controller-input"
          value={nick}
          maxLength={16}
          autoComplete="off"
          onChange={(event) => setNick(event.target.value)}
        />
        <button className="primary-btn controller-join-btn" onClick={() => setJoined(true)}>
          {t('party.join')}
        </button>
      </div>
    );
  }

  const buttonProps = (key: InputKey) => ({
    onPointerDown: (event: React.PointerEvent<HTMLButtonElement>) => {
      event.preventDefault();
      event.currentTarget.setPointerCapture(event.pointerId);
      press(key, 1);
    },
    onPointerUp: () => press(key, 0),
    onPointerCancel: () => press(key, 0),
    onLostPointerCapture: () => press(key, 0),
    onContextMenu: (event: React.MouseEvent) => event.preventDefault(),
  });

  return (
    <div className="controller-screen" style={{ ['--slot-color' as string]: color }}>
      <header className="controller-header">
        <span className="controller-badge" style={{ background: color }}>
          {slot ? t('party.slotBadge', { slot }) : '…'}
        </span>
        <span className="controller-nick">{nick}</span>
        <span className={`controller-status controller-status-${status}`}>
          {status === 'connected'
            ? phase === 'playing'
              ? t('party.statusPlaying')
              : t('party.statusWaiting')
            : t('party.statusReconnecting')}
        </span>
      </header>

      <div className="controller-pad">
        <button className="pad-btn pad-up" aria-label={t('party.up')} {...buttonProps('up')}>
          ▲
        </button>
        <button className="pad-btn pad-left" aria-label={t('party.left')} {...buttonProps('left')}>
          ◀
        </button>
        <button className="pad-btn pad-right" aria-label={t('party.right')} {...buttonProps('right')}>
          ▶
        </button>
        <button className="pad-btn pad-down" aria-label={t('party.down')} {...buttonProps('down')}>
          ▼
        </button>
      </div>

      <button className="action-btn" aria-label={t('party.action')} {...buttonProps('a')}>
        A
      </button>
    </div>
  );
}
