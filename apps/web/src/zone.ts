import { useEffect, type MutableRefObject } from 'react';
import type { ZoneLinkStep } from '@gamedevpl/contract';
import { BRIDGE_NAMESPACE } from './mp/protocol.js';
import { MAX_INPUTS_PER_SECOND, ZONE_PROTOCOL_VERSION, parseZoneBridgeMessage } from './zone/protocol.js';
import { ZoneClient } from './zone/zoneClient.js';
import { fetchZoneAdmission } from './zoneApi.js';
import { bindPlayRecorder } from './gamePlayer.js';

/**
 * The shell half of authoritative real-time zones (docs/persistent-world-plan.md P3).
 *
 * Third bridge, same arrangement as saves and worlds and for the same unmoved reason: a
 * game runs in `sandbox="allow-scripts"` with no `allow-same-origin` and a CSP with no
 * `connect-src`, so it cannot open a socket even if its author wanted one. The socket
 * lives here, in ordinary app code on the real origin, and the game reaches it only
 * through typed messages.
 *
 * What is different from the other two bridges is the direction of trust and the
 * cadence. A save and a world entry are things the game *tells* the platform; a zone is a
 * world the platform tells the game, ten times a second, and the game's own copy of the
 * simulation is a prediction that the next frame down may correct. So this code is a
 * relay rather than a client: it validates, it never interprets. Snapshot state is an
 * opaque string on the way through, deltas are event lists it does not read, and the
 * decision about whether a prediction has drifted belongs to the sim on the other side
 * of the bridge — which is the same `sim.ts` the host is running, which is the entire
 * point of the contract.
 *
 * The bridge is live for every published game, as the others are. Nothing happens until a
 * game says `zone:hello`, and only a game that ships a sim ever does.
 */

/**
 * Inputs one frame may send per second before the shell stops forwarding.
 *
 * Mirrors the host's own limit rather than sitting under it, so a game that trips this is
 * a game that would have been disconnected — the bridge just declines to spend the
 * connection finding that out. A dropped input is the right failure: it is an intent
 * about a moment, and the next one is a tenth of a second away.
 */
const INPUT_BUDGET = MAX_INPUTS_PER_SECOND;

export function useZoneBridge(frameRef: MutableRefObject<HTMLIFrameElement | null>, slug: string | undefined) {
  useEffect(() => {
    if (!slug) return;
    let cancelled = false;
    let client: ZoneClient | null = null;
    /** Guards against a game that says hello twice — one zone per frame, per session. */
    let admitting = false;
    /** Sliding one-second window of input timestamps, owned by this effect run. */
    let sent: number[] = [];
    /** Whether a world ever arrived, which is what separates a fallback from a drop. */
    let joined = false;
    /**
     * Bound at admission to the play session that was open then, and used for every rung
     * after it. The socket outlives this effect: a frame queued before teardown still
     * reaches `onFrame`, and a recorder that resolved the session per call would record
     * it against whatever game opened next.
     */
    let recordPlayEvent: (event: { type: 'zone_link'; step: ZoneLinkStep }) => void = () => {};

    function postToGame(payload: Record<string, unknown>) {
      if (cancelled) return;
      // The frame is sandboxed to an opaque origin, so '*' is the only possible target;
      // the game in turn only accepts messages whose source is its parent.
      frameRef.current?.contentWindow?.postMessage({ ns: BRIDGE_NAMESPACE, v: ZONE_PROTOCOL_VERSION, ...payload }, '*');
    }

    function allowInput(): boolean {
      const now = Date.now();
      sent = sent.filter((at) => now - at < 1000);
      if (sent.length >= INPUT_BUDGET) return false;
      sent.push(now);
      return true;
    }

    async function admit() {
      if (admitting || client) return;
      admitting = true;
      try {
        const admission = await fetchZoneAdmission(slug!);
        if (cancelled) return;
        if (!admission) {
          // No zone here: not published, declares none, or zones are not running on this
          // deployment. All three are the same fact from the game's side, and it is a
          // *permanent* one for this session — there is nothing to retry into.
          postToGame({ t: 'zone:state', available: false, retryable: false });
          return;
        }

        // A seat was issued. This is the denominator: every open past this point was
        // *supposed* to end up in a shared world, so anything that does not is a
        // fallback the player was never told about.
        recordPlayEvent = bindPlayRecorder();
        recordPlayEvent({ type: 'zone_link', step: 'admitted' });

        postToGame({
          t: 'zone:state',
          available: true,
          zone: admission.zone,
          tickHz: admission.tickHz,
          maxPlayers: admission.maxPlayers,
          inputs: admission.inputs,
          durable: admission.durable,
        });

        client = new ZoneClient({
          hostUrl: admission.hostUrl,
          zone: admission.zone,
          ticket: admission.ticket,
          onFrame: (frame) => {
            // The snapshot is the join, not the socket. A connection that upgrades and is
            // then closed with `zone_unavailable` is precisely how this failed on its
            // first day — counting `connected` as arrival would have had the metric
            // reporting health for the whole outage. A world only exists once one is sent.
            if (frame.t === 'snap' && !joined) {
              joined = true;
              recordPlayEvent({ type: 'zone_link', step: 'joined' });
            }
            // Relayed verbatim under a `zone:` prefix. The shell has already proved the
            // frame is well-formed; what it means is the sim's business.
            postToGame({ ...frame, t: `zone:${frame.t}` });
          },
          onStatus: (status, reason) => {
            // Only a world we actually had can be lost. Without the guard, a link that
            // never delivered a snapshot would report `lost` and read as churn, when it
            // is the flat failure `joined`-over-`admitted` is there to expose.
            if (status === 'closed' && joined) recordPlayEvent({ type: 'zone_link', step: 'lost' });
            postToGame({ t: 'zone:link', status, ...(reason ? { reason } : {}) });
          },
        });
        client.connect();
      } catch {
        // Could not find out. Distinct from "there is nothing here" on purpose, the same
        // distinction the save bridge needed: `retryable` lets the game ask again rather
        // than spending the whole session offline because one request met a bad moment.
        if (!cancelled) postToGame({ t: 'zone:state', available: false, retryable: true });
      } finally {
        admitting = false;
      }
    }

    function onMessage(event: MessageEvent) {
      // Pin to this theater's frame: any other window posting `gdp` traffic is not the
      // game we are serving, and must not act as a player in this zone.
      if (!frameRef.current || event.source !== frameRef.current.contentWindow) return;
      const message = parseZoneBridgeMessage(event.data, BRIDGE_NAMESPACE);
      if (!message) return;

      if (message.t === 'zone:hello') {
        void admit();
        return;
      }
      if (!client) return;
      if (message.t === 'zone:resync') {
        client.requestResync();
        return;
      }
      if (message.t === 'zone:send' && allowInput()) {
        client.sendInput(message.k, message.d);
      }
    }

    window.addEventListener('message', onMessage);
    return () => {
      cancelled = true;
      window.removeEventListener('message', onMessage);
      // Closed rather than left to time out. A zone with nobody in it should hibernate
      // promptly — that is what makes scale-to-zero honest (docs/p3-zone-host-infra.md
      // §4), and a socket idling for its timeout keeps an empty world ticking and an
      // instance alive to tick it.
      client?.close();
      client = null;
    };
  }, [frameRef, slug]);
}
