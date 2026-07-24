import { useCallback, useEffect, useState, type MutableRefObject } from 'react';

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
//      and is mirrored back via a MutationObserver).
const BRIDGE = `(function(){
  function el(id){return document.getElementById(id);}
  function isMuted(){var s=el('sound-toggle');return s?s.getAttribute('aria-pressed')==='true':false;}
  function sendMeta(){
    var t=el('game-title'),d=el('game-desc');
    parent.postMessage({source:'${PLAYER}',type:'meta',title:t?(t.textContent||'').trim():'',desc:d?(d.textContent||'').trim():'',muted:isMuted()},'*');
  }
  function sendSound(){parent.postMessage({source:'${PLAYER}',type:'sound',muted:isMuted()},'*');}
  addEventListener('message',function(e){
    var m=e.data||{};
    if(m.source!=='${HOST}')return;
    if(m.type==='hello'){sendMeta();}
    else if(m.type==='setSound'){var s=el('sound-toggle');if(s&&isMuted()!==!!m.muted){s.click();}sendSound();}
  });
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

export type GamePlayerMeta = { title: string; desc: string };

/**
 * Subscribes to the player bridge for the currently-embedded game iframe and
 * exposes its title/description and a sound toggle the header can drive. `active`
 * gates the subscription so it only runs while a single-player game is on stage.
 */
export function useGamePlayer(frameRef: MutableRefObject<HTMLIFrameElement | null>, active: boolean) {
  const [meta, setMeta] = useState<GamePlayerMeta | null>(null);
  const [muted, setMuted] = useState(false);

  useEffect(() => {
    if (!active) {
      setMeta(null);
      setMuted(false);
      return;
    }
    function onMessage(event: MessageEvent) {
      const data = event.data as { source?: string; type?: string; title?: string; desc?: string; muted?: boolean };
      if (!data || data.source !== PLAYER) return;
      if (data.type === 'meta') {
        setMeta({ title: String(data.title ?? ''), desc: String(data.desc ?? '') });
        setMuted(Boolean(data.muted));
      } else if (data.type === 'sound') {
        setMuted(Boolean(data.muted));
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
