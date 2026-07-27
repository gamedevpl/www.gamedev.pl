import { useCallback, useEffect, useRef, useState, type MutableRefObject } from 'react';
import { isPlayTimeAccruing, TelemetrySession } from './telemetry';
import { recordVisitEvent } from './visitTelemetry';

// Message envelope tags. The host is the app; the player is the bridge script
// that runs inside the sandboxed game iframe.
const HOST = 'gdpl-host';
const PLAYER = 'gdpl-player';

// Runs inside the game's srcdoc iframe. The game CSP allows inline script/style
// (script-src 'unsafe-inline'), and postMessage to the parent is not a network
// operation so default-src 'none' doesn't block it. The bridge:
//   1. hides the game's built-in title/description/sound chrome — the app shows
//      those in the player header instead, so they don't eat vertical space
//      stacked above the canvas;
//   2. reports the (localized) title/description and mute state up to the host;
//   3. drives the game's own #sound-toggle when the header control is clicked,
//      so a single toggle stays authoritative (the in-game 'M' key still works
//      and is mirrored back via a MutationObserver);
//   4. forwards Escape to the host. The game iframe holds keyboard focus (that's
//      what makes WASD work without a click first), and key events inside an
//      opaque-origin frame never reach the app's own listener — so without this
//      relay, "get me out of here" silently stops working;
//   5. forwards pointerdown so the host can dismiss overlays (e.g. the More menu)
//      without covering the playfield — parent document listeners never see taps
//      inside this opaque-origin frame, and focus tricks don't fire reliably on
//      mobile either. Report-only: the game still gets the same pointer event;
//   6. reports health — uncaught errors and animation-frame liveness. This is the
//      only vantage point that has them: the game runs in an opaque origin the app
//      cannot inspect, and its CSP blocks every way it could report for itself. An
//      uncaught error is the single most reliable "this published game is broken"
//      signal we can get, and `frames: 0` while on screen distinguishes a stalled
//      game from a hard game (docs/improvement-loop-plan.md IL-1).
const BRIDGE = `(function(){
  function el(id){return document.getElementById(id);}
  function post(m){m.source='${PLAYER}';parent.postMessage(m,'*');}
  function isMuted(){var s=el('sound-toggle');return s?s.getAttribute('aria-pressed')==='true':false;}
  function sendMeta(){
    var t=el('game-title'),d=el('game-desc');
    post({type:'meta',title:t?(t.textContent||'').trim():'',desc:d?(d.textContent||'').trim():'',muted:isMuted()});
  }
  function sendSound(){post({type:'sound',muted:isMuted()});}
  addEventListener('error',function(e){post({type:'error',message:String((e&&e.message)||'error').slice(0,200)});});
  addEventListener('unhandledrejection',function(e){
    var r=e&&e.reason;post({type:'error',message:String((r&&r.message)||r||'unhandled rejection').slice(0,200)});
  });
  var frames=0;
  if('requestAnimationFrame'in window){(function tick(){frames++;requestAnimationFrame(tick);})();}
  setInterval(function(){post({type:'alive',frames:frames});frames=0;},5000);
  addEventListener('message',function(e){
    var m=e.data||{};
    if(m.source!=='${HOST}')return;
    if(m.type==='hello'){sendMeta();}
    else if(m.type==='setSound'){var s=el('sound-toggle');if(s&&isMuted()!==!!m.muted){s.click();}sendSound();}
  });
  addEventListener('keydown',function(e){
    // Report only — the game keeps its own Escape handling (pause menus etc).
    if(e.key==='Escape'){post({type:'key',key:'Escape'});}
  });
  addEventListener('pointerdown',function(){post({type:'pointer'});},{passive:true});
  function init(){
    sendMeta();
    var s=el('sound-toggle');
    if(s&&'MutationObserver'in window){new MutationObserver(sendSound).observe(s,{attributes:true,attributeFilter:['aria-pressed']});}
    setTimeout(sendMeta,400); // pick up any i18n applied just after load
  }
  if(document.readyState==='loading')addEventListener('DOMContentLoaded',init);else init();
})();`;

const HIDE_CHROME = `#game-title,#game-desc,.game-controls,.hint{display:none!important}`;

/**
 * Injects the player bridge + hide-chrome style into an assembled game document
 * so it can run headless-of-its-own-chrome inside the app's player. Falls back to
 * appending if there's no </body> (assembled games always have one, but be safe).
 */
export function embedGameHtml(html: string): string {
  const inject = `<style id="gdpl-embed">${HIDE_CHROME}</style><script>${BRIDGE}</script>`;
  return html.includes('</body>') ? html.replace('</body>', `${inject}</body>`) : html + inject;
}

/** en/pl are the only locales games ship strings for; anything else maps to en. */
export function toGameLocale(lang: string | undefined | null): 'en' | 'pl' {
  return lang?.toLowerCase().startsWith('pl') ? 'pl' : 'en';
}

/**
 * Rewrites the assembled game document's `<html lang="…">` so the game's own i18n
 * (games repo `shared/modules/core.ts` → resolveLocale, which reads
 * `document.documentElement.lang`) follows the app's selected language instead of
 * the sandboxed iframe's `navigator.language`. Without this, toggling the app to
 * Polish had no effect inside the game. A no-op when the fragment has no `<html>`
 * tag (e.g. test snippets), and it can only ever set en/pl.
 */
export function withGameLocale(html: string, lang: string | undefined | null): string {
  const locale = toGameLocale(lang);
  if (/<html\b[^>]*\slang\s*=/i.test(html)) {
    return html.replace(/(<html\b[^>]*?\slang\s*=\s*)("[^"]*"|'[^']*')/i, `$1"${locale}"`);
  }
  return html.replace(/<html\b/i, `<html lang="${locale}"`);
}

/**
 * Records one play session of a published game (docs/improvement-loop-plan.md IL-1).
 *
 * Lives here rather than in `GameTheater` on purpose: the theater also stages drafts
 * and multiplayer, and a creator playtesting their own work-in-progress is developer
 * traffic that must not land in the funnel. Mounting alongside the *published* game
 * makes "is this a real play of a real game" a structural fact instead of a condition
 * someone has to remember to write.
 */
export function useGameTelemetry(slug: string, enabled: boolean, slots?: number) {
  useEffect(() => {
    if (!enabled) return;

    const session = new TelemetrySession(slug, crypto.randomUUID());
    session.record({ type: 'game_opened', ...(slots === undefined ? {} : { slots }) });
    // The same moment, counted in the visit stream — deliberately without the slug, so
    // depth ("did this sitting play a second game") is answerable while "which games did
    // this tab play" stays unanswerable.
    recordVisitEvent({ type: 'play_started' });
    // Sent immediately rather than batched. Every other event can afford to wait, but
    // a tab that is killed outright runs no cleanup and flushes nothing — and an open
    // we never hear about is a hole in the denominator of every ratio downstream.
    session.flush();

    // Heartbeat rather than a start/stop stopwatch: a tab can be closed, crash, or be
    // discarded without ever running cleanup, and a session that ends that way should
    // still have its play time up to the last tick. Each beat is only claimed after
    // the interval has actually elapsed with the page focused.
    const heartbeatSec = 15;
    const timer = window.setInterval(() => {
      if (isPlayTimeAccruing(document)) session.record({ type: 'play_time', seconds: heartbeatSec });
    }, heartbeatSec * 1000);

    // Health and depth from inside the frame. `progress`/`score`/`end` arrive only
    // from games using the games-repo telemetry module; nothing sends them yet, and
    // accepting them now means adding it later touches no app code.
    function onMessage(event: MessageEvent) {
      // Sandboxed game frames (no allow-same-origin) report origin "null".
      // Reject anything else so a hostile frame can't spoof player telemetry.
      if (event.origin !== 'null') return;
      const data = event.data as {
        source?: string;
        type?: string;
        message?: string;
        frames?: number;
        label?: string;
        value?: number;
        outcome?: 'won' | 'lost' | 'quit';
      };
      if (!data || data.source !== PLAYER) return;
      switch (data.type) {
        case 'error':
          session.record({ type: 'error', message: String(data.message ?? '') });
          break;
        case 'alive':
          // Only while the player is actually watching — frames reported by a
          // backgrounded tab say nothing about whether the game works.
          if (isPlayTimeAccruing(document)) session.record({ type: 'alive', frames: Number(data.frames ?? 0) });
          break;
        case 'progress':
          session.record({ type: 'progress', label: String(data.label ?? '') });
          break;
        case 'score':
          session.record({ type: 'score', value: Number(data.value) });
          break;
        case 'end':
          if (data.outcome) session.record({ type: 'end', outcome: data.outcome });
          break;
      }
    }
    window.addEventListener('message', onMessage);

    // A hidden tab may never get another frame of script, so flush on the way out
    // instead of hoping for unmount.
    function onHide() {
      if (document.visibilityState === 'hidden') session.flush();
    }
    document.addEventListener('visibilitychange', onHide);

    return () => {
      window.clearInterval(timer);
      window.removeEventListener('message', onMessage);
      document.removeEventListener('visibilitychange', onHide);
      session.record({ type: 'game_closed' });
      session.close();
    };
  }, [slug, enabled, slots]);
}

export type GamePlayerMeta = { title: string; desc: string };

/**
 * Subscribes to the player bridge for the currently-embedded game iframe and
 * exposes its title/description and a sound toggle the header can drive. `active`
 * gates the subscription so it only runs while a single-player game is on stage.
 */
export function useGamePlayer(
  frameRef: MutableRefObject<HTMLIFrameElement | null>,
  active: boolean,
  /** Called when Escape is pressed *inside* the game (see the bridge's job 4). */
  onEscape?: () => void,
  /** Called on pointerdown inside the game (see the bridge's job 5). */
  onPointer?: () => void,
) {
  const [meta, setMeta] = useState<GamePlayerMeta | null>(null);
  const [muted, setMuted] = useState(false);

  // Held in refs so a caller's inline closures can't resubscribe the listener below.
  const onEscapeRef = useRef(onEscape);
  onEscapeRef.current = onEscape;
  const onPointerRef = useRef(onPointer);
  onPointerRef.current = onPointer;

  useEffect(() => {
    if (!active) {
      setMeta(null);
      setMuted(false);
      return;
    }
    function onMessage(event: MessageEvent) {
      // Opaque-origin sandboxed iframe → origin string is "null".
      if (event.origin !== 'null') return;
      // Also pin to this theater's iframe so any other null-origin frame can't
      // spoof gdpl-player traffic. Synthetic MessageEvents in unit tests omit
      // `source` (null) — still accept those so the handler path is exercised.
      if (event.source !== null && event.source !== frameRef.current?.contentWindow) return;
      const data = event.data as {
        source?: string;
        type?: string;
        title?: string;
        desc?: string;
        muted?: boolean;
        key?: string;
      };
      if (!data || data.source !== PLAYER) return;
      if (data.type === 'meta') {
        setMeta({ title: String(data.title ?? ''), desc: String(data.desc ?? '') });
        setMuted(Boolean(data.muted));
      } else if (data.type === 'sound') {
        setMuted(Boolean(data.muted));
      } else if (data.type === 'key' && data.key === 'Escape') {
        onEscapeRef.current?.();
      } else if (data.type === 'pointer') {
        onPointerRef.current?.();
      }
    }
    window.addEventListener('message', onMessage);
    // The bridge auto-posts its meta on load, but if it booted before this
    // listener attached (or the game was swapped), nudge it a few times.
    let tries = 0;
    const timer = window.setInterval(() => {
      frameRef.current?.contentWindow?.postMessage({ source: HOST, type: 'hello' }, '*');
      if (++tries >= 5) window.clearInterval(timer);
    }, 200);
    return () => {
      window.removeEventListener('message', onMessage);
      window.clearInterval(timer);
    };
  }, [active, frameRef]);

  const toggleSound = useCallback(() => {
    setMuted((prev) => {
      const next = !prev;
      frameRef.current?.contentWindow?.postMessage({ source: HOST, type: 'setSound', muted: next }, '*');
      return next;
    });
  }, [frameRef]);

  return { meta, muted, toggleSound };
}
