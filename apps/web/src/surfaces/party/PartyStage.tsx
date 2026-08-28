import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { CatalogEntry } from '../../catalog.js';
import { PublishedGameFrame } from '../../PublishedGameFrame.js';
import type { PlayVia } from '../../visitTelemetry.js';
import { joinUrl, type PartySession } from './mpApi.js';
import { QrCode } from './QrCode.js';
import { RoomClient, type RoomStatus } from './roomClient.js';
import { BRIDGE_NAMESPACE, parseGameBridgeMessage, PROTOCOL_VERSION, type RosterSlot } from '../../mp/protocol.js';

type PartyStageProps = {
  game: CatalogEntry;
  session: PartySession;
  // Which home page surface launched Play Together, if it did.
  via?: PlayVia;
  onExit: () => void;
};

/**
 * The shared screen: lobby first (QR + who has joined), then the game with a live
 * bridge relaying phone input into the sandboxed iframe.
 *
 * The game is deliberately NOT mounted during the lobby. Our games start their
 * round the moment they load, so mounting early would burn the first minute of
 * play while everyone is still scanning.
 */
export function PartyStage({ game, session, via, onExit }: PartyStageProps) {
  const { t } = useTranslation();
  const [roster, setRoster] = useState<RosterSlot[]>([]);
  const [status, setStatus] = useState<RoomStatus>('connecting');
  const [closedReason, setClosedReason] = useState<string | null>(null);
  const [started, setStarted] = useState(false);
  const frameRef = useRef<HTMLIFrameElement | null>(null);
  const clientRef = useRef<RoomClient | null>(null);
  const rosterRef = useRef<RosterSlot[]>([]);

  const url = useMemo(() => joinUrl(session), [session]);

  /** Everything sent into the game is platform-built — never a raw client frame. */
  const postToGame = useCallback((payload: Record<string, unknown>) => {
    // The frame is sandboxed to an opaque origin, so '*' is the only possible
    // target; the frame in turn only accepts messages from its parent.
    frameRef.current?.contentWindow?.postMessage({ ns: BRIDGE_NAMESPACE, v: PROTOCOL_VERSION, ...payload }, '*');
  }, []);

  useEffect(() => {
    const client = new RoomClient({
      code: session.code,
      token: session.hostToken,
      onStatus: (next, reason) => {
        setStatus(next);
        if (next === 'closed' && reason) setClosedReason(reason);
      },
      onFrame: (frame) => {
        if (frame.t === 'roster') {
          rosterRef.current = frame.slots;
          setRoster(frame.slots);
          postToGame({ t: 'roster', slots: frame.slots });
          return;
        }
        if (frame.t === 'input') {
          // `d` is key down/up. Do not rename to `v` — every bridge frame already
          // carries `v` as PROTOCOL_VERSION, and the game reads `d` for held state.
          postToGame({ t: 'input', slot: frame.slot, k: frame.k, d: frame.d });
          return;
        }
        if (frame.t === 'closed') {
          setClosedReason(frame.reason);
        }
      },
    });
    clientRef.current = client;
    client.connect();

    return () => {
      client.close();
      clientRef.current = null;
    };
  }, [session, postToGame]);

  // The game announces itself when it boots; answer with the current roster so it
  // knows which slots are on phones. Messages from the frame are untrusted.
  useEffect(() => {
    const onMessage = (event: MessageEvent) => {
      if (!frameRef.current || event.source !== frameRef.current.contentWindow) return;
      const message = parseGameBridgeMessage(event.data);
      if (!message) return;
      if (message.t === 'hello') {
        postToGame({ t: 'roster', slots: rosterRef.current });
        postToGame({ t: 'phase', phase: 'playing' });
      }
      if (message.t === 'phase' && message.phase === 'ended') {
        clientRef.current?.setPhase('ended');
      }
    };

    window.addEventListener('message', onMessage);
    return () => window.removeEventListener('message', onMessage);
  }, [postToGame]);

  const joined = roster.filter((slot) => slot.connected).length;
  const minPlayers = game.multiplayer?.minPlayers ?? 2;
  // Unclaimed slots stay playable on the host keyboard, so a lobby is never a
  // dead end — but the button copy should still nudge people to scan.
  const canStart = status === 'connected';

  function handleStart() {
    clientRef.current?.setPhase('playing');
    setStarted(true);
  }

  if (closedReason) {
    return (
      <div className="party-panel">
        <h2>{t('party.roomClosedTitle')}</h2>
        <p>{t(`party.closed.${closedReason}`, { defaultValue: t('party.closed.generic') })}</p>
        <button className="primary-btn" onClick={onExit}>
          {t('party.backToCatalog')}
        </button>
      </div>
    );
  }

  if (started) {
    return (
      <div className="party-playing">
        <div className="party-slotstrip">
          {roster.map((slot) => (
            <span
              key={slot.slot}
              className={`party-chip ${slot.connected ? 'is-connected' : ''}`}
              style={{ borderColor: slot.color, color: slot.color }}
            >
              <span className="party-dot" style={{ background: slot.color }} />
              {slot.nick ?? t('party.keyboardSlot', { slot: slot.slot })}
            </span>
          ))}
        </div>
        <PublishedGameFrame
          slug={game.slug}
          title={game.title}
          frameRef={frameRef}
          slots={roster.filter((slot) => slot.connected).length}
          via={via}
        />
      </div>
    );
  }

  return (
    <div className="party-lobby">
      <div className="party-qr-block">
        <QrCode value={url} label={t('party.qrLabel', { code: session.code })} />
        <p className="party-code">{session.code}</p>
        <a className="party-url" href={url} target="_blank" rel="noopener noreferrer">
          {url.replace(/^https?:\/\//, '')}
        </a>
      </div>

      <div className="party-lobby-side">
        <h2 className="party-title">{t('party.scanToJoin')}</h2>
        <p className="party-sub">{t('party.scanHint', { min: minPlayers, max: session.maxPlayers })}</p>

        <ul className="party-slots">
          {roster.map((slot) => (
            <li key={slot.slot} className={`party-slot ${slot.connected ? 'is-connected' : ''}`}>
              <span className="party-dot" style={{ background: slot.color }} />
              <span className="party-slot-name">{slot.nick ?? t('party.emptySlot')}</span>
              <span className="party-slot-tag">
                {slot.connected ? t('party.onPhone') : t('party.keyboardSlot', { slot: slot.slot })}
              </span>
              {slot.connected && (
                <button className="party-kick" onClick={() => clientRef.current?.kick(slot.slot)}>
                  {t('party.kick')}
                </button>
              )}
            </li>
          ))}
        </ul>

        <div className="party-actions">
          <button className="primary-btn" disabled={!canStart} onClick={handleStart}>
            {joined >= minPlayers ? t('party.start', { count: joined }) : t('party.startAnyway')}
          </button>
          <button className="secondary-btn" onClick={onExit}>
            {t('party.cancel')}
          </button>
        </div>

        <p className="party-status">{status === 'connected' ? t('party.statusReady') : t('party.statusConnecting')}</p>
      </div>
    </div>
  );
}
