import type { Locale } from '@gamedevpl/contract';
import { useCallback, useEffect, useRef, useState, type MutableRefObject } from 'react';
import { isPlayTimeAccruing, TelemetrySession, type TelemetryEvent } from './telemetry.js';
import { readReportedControls, type ReportedControls } from './howToPlay.js';
import { recordVisitEvent, type PlayVia } from './visitTelemetry.js';

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
//   6. reports discrete player activity (keydown / pointerdown) so host chrome can
//      start its hide clock once play begins. Pointer *movement* is not activity —
//      mouse-aim games would otherwise keep the theater bar flapping forever;
//   7. reports health — uncaught errors and animation-frame liveness. This is the
//      only vantage point that has them: the game runs in an opaque origin the app
//      cannot inspect, and its CSP blocks every way it could report for itself. An
//      uncaught error is the single most reliable "this published game is broken"
//      signal we can get, and `frames: 0` while on screen distinguishes a stalled
//      game from a hard game (docs/improvement-loop-plan.md IL-1);
//   8. reports the game's own account of its controls, for the player's How-to-play
//      card. Job 1 is exactly why this is needed: the card is host chrome because the
//      game's `.game-controls` and `.hint` are hidden here, and an opaque origin means
//      the host cannot read them for itself. The alternative — the catalog's `controls`
//      string — is prose an agent wrote in a SPEC, is English-only, cannot name a touch
//      button, and is absent entirely on a `/play/` deep link (the catalog is fetched on
//      the home route only). Everything reported here is agent-authored text and is
//      validated and rendered as text by the host, never as markup.
const BRIDGE = `(function(){
  function el(id){return document.getElementById(id);}
  function post(m){m.source='${PLAYER}';parent.postMessage(m,'*');}
  function isMuted(){var s=el('sound-toggle');return s?s.getAttribute('aria-pressed')==='true':false;}
  function sendMeta(){
    var t=el('game-title'),d=el('game-desc');
    post({type:'meta',title:t?(t.textContent||'').trim():'',desc:d?(d.textContent||'').trim():'',muted:isMuted()});
  }
  function sendSound(){post({type:'sound',muted:isMuted()});}
  // --- controls (job 7) -------------------------------------------------------
  // Everything below reads the game's *own* account of its controls and hands it to
  // the host, which has no other way to get one: it hides this document's chrome and
  // cannot see into an opaque origin. Three sources, best first. All of it is
  // agent-authored text — the host validates and renders it as text, never as markup.
  function text(node){return node?String(node.textContent||'').replace(/\\s+/g,' ').trim():'';}
  /** The shell's how-to-play popup: already a dt/dd key→action table, already localized. */
  function legendRows(){
    var out=[],groups=document.querySelectorAll('.legend-keys');
    for(var g=0;g<groups.length;g++){
      var kids=groups[g].children;
      // dt/dd arrive as siblings, not wrapped: pair each dt with the dd that follows.
      for(var i=0;i<kids.length;i++){
        if(kids[i].tagName!=='DT')continue;
        var next=kids[i+1];
        if(!next||next.tagName!=='DD')continue;
        var keys=text(kids[i]),action=text(next);
        if(keys||action)out.push({keys:keys,action:action});
      }
    }
    return out;
  }
  /**
   * Keycaps, from the names GameKit reads keys by.
   *
   * Space arrives as " ", which survives a truthiness check but is whitespace — the host
   * collapses and trims every reported field, so posting it raw loses the key entirely and
   * "Space to fire" renders as an actionless row. The rest are lowercase internal names
   * ("shift", "arrowup") that read as code rather than as something to press.
   */
  var KEY_NAMES={' ':'Space',shift:'Shift',control:'Ctrl',alt:'Alt',meta:'Meta',enter:'Enter',
    escape:'Esc',tab:'Tab',backspace:'Backspace',arrowup:'Up',arrowdown:'Down',
    arrowleft:'Left',arrowright:'Right'};
  function keyName(key){
    var raw=String(key),lower=raw.toLowerCase();
    // hasOwnProperty, not a bare lookup: these names come from game code, and "constructor"
    // would otherwise resolve up the prototype chain to a function.
    if(Object.prototype.hasOwnProperty.call(KEY_NAMES,lower))return KEY_NAMES[lower];
    return raw.length===1?raw.toUpperCase():raw;
  }
  /** GameKit's resolved input config — the only source that can name a touch button. */
  function kitRows(){
    var out=[];
    try{
      var kit=window.GameKit;
      if(!kit||typeof kit.controlsManifest!=='function')return padRows();
      var m=kit.controlsManifest();
      if(!m)return padRows();
      var buttons=m.buttons||[];
      for(var i=0;i<buttons.length;i++){
        var names=[],raw=buttons[i].keys||[];
        for(var k=0;k<raw.length;k++)names.push(keyName(raw[k]));
        var keys=names.join(' / '),label=String(buttons[i].label||'');
        if(keys&&label)out.push({keys:keys,action:label,touch:true});
      }
      if(m.pad)out.push({keys:'',action:'',pad:String(m.pad)});
    }catch(err){return padRows();}
    return out.length>0?out:padRows();
  }
  /**
   * The pad GameKit actually built, read off the page.
   *
   * Weaker than the manifest — it names buttons but not the keys behind them, and it
   * exists only where the pad does (a coarse pointer) — but it needs nothing from the
   * games repo, so it works on every published snapshot today rather than after a
   * re-bake. On the devices where it is present, the key behind a button is not the
   * question anyway: you tap the button.
   */
  function padRows(){
    // \`seen\` is a list, not a keyed object: these labels are written by the game, and
    // "__proto__" as a property name would reach Object.prototype.
    var out=[],seen=[];
    try{
      var buttons=document.querySelectorAll('.gamekit-touch-btn');
      for(var i=0;i<buttons.length;i++){
        var label=text(buttons[i]);
        if(!label||seen.indexOf(label)!==-1)continue;
        seen.push(label);
        out.push({keys:'',action:label,touch:true});
      }
      if(document.querySelector('.gamekit-touch-pad'))out.push({keys:'',action:'',pad:'full'});
    }catch(err){}
    return out;
  }
  function sendControls(){
    var rows=legendRows(),kit=kitRows();
    post({type:'controls',rows:rows,kit:kit,hint:text(document.querySelector('.hint'))});
  }
  addEventListener('error',function(e){post({type:'error',message:String((e&&e.message)||'error').slice(0,200)});});
  addEventListener('unhandledrejection',function(e){
    var r=e&&e.reason;post({type:'error',message:String((r&&r.message)||r||'unhandled rejection').slice(0,200)});
  });
  var frames=0,paused=false,overlay=null,lastAlive=0;
  // Hold rAF / AudioContext here — GameKit's gdpl-pause only skips update() and
  // still calls draw(), and many playtest docs were assembled before those listeners
  // existed. Overlay alone left motion visible through the veil (Studio felt broken).
  // Patch early (inject in <head>) so games that look up requestAnimationFrame each
  // frame are held; already-scheduled native callbacks may run once more, then re-enter.
  var _raf=window.requestAnimationFrame&&window.requestAnimationFrame.bind(window);
  var _caf=window.cancelAnimationFrame&&window.cancelAnimationFrame.bind(window);
  var _si=window.setInterval.bind(window);
  var heldRaf=[],rafSeq=0,heldRafIds={},audioCtxs=[];
  if(_raf){
    window.requestAnimationFrame=function(cb){
      if(!paused)return _raf(cb);
      var id=++rafSeq;
      heldRaf.push({id:id,cb:cb});
      heldRafIds[id]=1;
      return id;
    };
    window.cancelAnimationFrame=function(id){
      if(heldRafIds[id]){
        heldRaf=heldRaf.filter(function(h){return h.id!==id;});
        delete heldRafIds[id];
        return;
      }
      if(_caf)_caf(id);
    };
  }
  var OrigAC=window.AudioContext||window.webkitAudioContext;
  if(OrigAC){
    var WrapAC=function(){
      var ctx=new OrigAC();
      try{audioCtxs.push(ctx);}catch(err){}
      if(paused&&ctx.suspend)try{ctx.suspend();}catch(err){}
      return ctx;
    };
    WrapAC.prototype=OrigAC.prototype;
    window.AudioContext=WrapAC;
    if('webkitAudioContext'in window)window.webkitAudioContext=WrapAC;
  }
  function suspendAudio(yes){
    for(var i=0;i<audioCtxs.length;i++){
      var c=audioCtxs[i];
      try{if(yes){if(c.suspend)c.suspend();}else if(c.resume)c.resume();}catch(err){}
    }
  }
  function flushHeldRaf(){
    var q=heldRaf;heldRaf=[];heldRafIds={};
    if(!_raf)return;
    for(var i=0;i<q.length;i++){(function(cb){_raf(function(t){try{cb(t);}catch(err){}});}(q[i].cb));}
  }
  if(_raf){(function tick(){frames++;requestAnimationFrame(tick);})();}
  _si(function(){lastAlive=frames;post({type:'alive',frames:frames});frames=0;},5000);
  function largestCanvas(){
    var best=null,area=0,list=document.querySelectorAll('canvas');
    for(var i=0;i<list.length;i++){
      var c=list[i],a=(c.width||0)*(c.height||0);
      if(a>area){area=a;best=c;}
    }
    return best;
  }
  function encodeScaled(source,srcW,srcH){
    var max=1280,scale=Math.min(1,max/Math.max(srcW,srcH));
    if(scale>=1){
      try{return source.toDataURL('image/png').split(',')[1]||null;}catch(err){return null;}
    }
    var off=document.createElement('canvas');
    off.width=Math.max(1,Math.round(srcW*scale));
    off.height=Math.max(1,Math.round(srcH*scale));
    var ctx=off.getContext('2d');
    if(!ctx)return null;
    try{
      ctx.drawImage(source,0,0,off.width,off.height);
      return off.toDataURL('image/png').split(',')[1]||null;
    }catch(err){return null;}
  }
  // Full viewport composite inside the opaque-origin frame (parent cannot screenshot
  // across sandbox). Draws every visible canvas/video/img in layout order on top of
  // the page background. DOM text chrome is not rasterized — games that paint UI on
  // canvas are covered; HTML overlays are not. Capture must run *before* the pause
  // overlay is shown so the veil is not in the shot.
  function capturePng(){
    try{
      var vw=Math.max(1,window.innerWidth||document.documentElement.clientWidth||1);
      var vh=Math.max(1,window.innerHeight||document.documentElement.clientHeight||1);
      var max=1280,scale=Math.min(1,max/Math.max(vw,vh));
      var out=document.createElement('canvas');
      out.width=Math.max(1,Math.round(vw*scale));
      out.height=Math.max(1,Math.round(vh*scale));
      var ctx=out.getContext('2d');
      if(!ctx){
        var only=largestCanvas();
        return only&&only.width&&only.height?encodeScaled(only,only.width,only.height):null;
      }
      var bg='#0b1018';
      try{
        var bodyBg=getComputedStyle(document.body).backgroundColor;
        if(bodyBg&&bodyBg!=='transparent'&&bodyBg!=='rgba(0, 0, 0, 0)')bg=bodyBg;
      }catch(err){}
      ctx.fillStyle=bg;
      ctx.fillRect(0,0,out.width,out.height);
      var nodes=document.querySelectorAll('canvas,video,img');
      var drew=false;
      for(var i=0;i<nodes.length;i++){
        var node=nodes[i];
        if(node.id==='gdpl-pause-overlay')continue;
        var rect=node.getBoundingClientRect();
        if(rect.width<1||rect.height<1)continue;
        try{
          var st=getComputedStyle(node);
          if(st.display==='none'||st.visibility==='hidden'||Number(st.opacity)===0)continue;
        }catch(err){}
        try{
          ctx.drawImage(node,rect.left*scale,rect.top*scale,rect.width*scale,rect.height*scale);
          drew=true;
        }catch(err){}
      }
      if(!drew){
        var fallback=largestCanvas();
        return fallback&&fallback.width&&fallback.height
          ?encodeScaled(fallback,fallback.width,fallback.height)
          :null;
      }
      return out.toDataURL('image/png').split(',')[1]||null;
    }catch(err){return null;}
  }
  function showOverlay(){
    if(overlay)return;
    overlay=document.createElement('div');
    overlay.id='gdpl-pause-overlay';
    overlay.setAttribute('aria-hidden','true');
    overlay.style.cssText='position:fixed;inset:0;z-index:2147483647;background:rgba(6,10,18,.55);pointer-events:all;';
    document.documentElement.appendChild(overlay);
  }
  function hideOverlay(){if(overlay){overlay.remove();overlay=null;}}
  function sendSnapshot(reason,png){
    post({
      type:'snapshot',
      reason:reason,
      paused:paused,
      png:png===undefined?capturePng():png,
      aliveFrames:lastAlive
    });
  }
  function setPaused(next){
    if(next===paused){if(next)sendSnapshot('pause');return;}
    paused=next;
    if(paused){
      // Snapshot first — then veil — so the overlay never lands in the PNG.
      var png=capturePng();
      document.dispatchEvent(new CustomEvent('gdpl-pause'));
      showOverlay();
      suspendAudio(true);
      sendSnapshot('pause',png);
    }else{
      hideOverlay();
      suspendAudio(false);
      flushHeldRaf();
      document.dispatchEvent(new CustomEvent('gdpl-resume'));
      post({type:'resumed'});
    }
  }
  // Track 4: __GAME_HARNESS__ is the same versioned surface the gate's capture
  // tooling already calls directly (screenshot()) — snapshotState/restoreState are
  // absent on a game built against an older kit, hence the typeof guards.
  function sendStateSnapshot(){
    var h=window.__GAME_HARNESS__;
    var data=(h&&typeof h.snapshotState==='function')?h.snapshotState():null;
    post({type:'stateSnapshot',data:data});
  }
  function applyStateRestore(data){
    var h=window.__GAME_HARNESS__;
    var ok=(h&&typeof h.restoreState==='function')?!!h.restoreState(data):false;
    post({type:'stateRestored',ok:ok});
  }
  addEventListener('message',function(e){
    var m=e.data||{};
    if(m.source!=='${HOST}')return;
    if(m.type==='hello'){sendMeta();sendControls();}
    else if(m.type==='setSound'){var s=el('sound-toggle');if(s&&isMuted()!==!!m.muted){s.click();}sendSound();}
    else if(m.type==='pause'){setPaused(true);}
    else if(m.type==='resume'){setPaused(false);}
    else if(m.type==='capture'){sendSnapshot('capture');}
    else if(m.type==='snapshotState'){sendStateSnapshot();}
    else if(m.type==='restoreState'){applyStateRestore(m.data);}
  });
  var lastActivity=0;
  function reportActivity(){
    var now=Date.now();
    if(now-lastActivity<250)return;
    lastActivity=now;
    post({type:'activity'});
  }
  addEventListener('keydown',function(e){
    // Report only — the game keeps its own Escape handling (pause menus etc).
    if(e.key==='Escape'){post({type:'key',key:'Escape'});}
    else{reportActivity();}
  });
  // held: a separate signal from 'activity' — a joystick or drag held past the
  // 400ms swap-idle window must not look idle just because nothing new fired.
  var pointerHeld=false;
  function playerPointerDown(){lastActivity=Date.now();pointerHeld=true;post({type:'pointer'});post({type:'held',held:true});}
  function playerPointerUp(){if(!pointerHeld)return;pointerHeld=false;post({type:'held',held:false});}
  if(typeof PointerEvent==='function'){
    addEventListener('pointerdown',playerPointerDown,{passive:true});
    addEventListener('pointerup',playerPointerUp,{passive:true});
    addEventListener('pointercancel',playerPointerUp,{passive:true});
  }else{
    // Older/restricted WebViews may expose only the pre-Pointer Events APIs.
    addEventListener('mousedown',playerPointerDown,{passive:true});
    addEventListener('touchstart',playerPointerDown,{passive:true});
    addEventListener('mouseup',playerPointerUp,{passive:true});
    addEventListener('touchend',playerPointerUp,{passive:true});
  }
  // iOS Safari: long-press on the canvas opens the callout (Copy / Translate / Look Up)
  // and the text-selection loupe ("mini zoom"). CSS covers most of it; these kill the
  // remaining native handlers. Games have no selectable document chrome in the player.
  addEventListener('contextmenu',function(e){e.preventDefault();});
  addEventListener('selectstart',function(e){e.preventDefault();});
  function fitGameCanvas(){
    var canvas=el('game');
    if(!canvas||!canvas.width||!canvas.height)return;
    var bounds=document.body.getBoundingClientRect();
    canvas.style.setProperty('--gdpl-canvas-ratio',String(canvas.width/canvas.height));
    canvas.style.setProperty('--gdpl-embed-width',String(bounds.width)+'px');
    canvas.style.setProperty('--gdpl-embed-height',String(bounds.height)+'px');
  }
  function scheduleGameCanvasFit(){
    fitGameCanvas();
    setTimeout(fitGameCanvas,0);
  }
  addEventListener('resize',scheduleGameCanvasFit);
  function init(){
    scheduleGameCanvasFit();
    sendMeta();
    var s=el('sound-toggle');
    if(s&&'MutationObserver'in window){new MutationObserver(sendSound).observe(s,{attributes:true,attributeFilter:['aria-pressed']});}
    sendControls();
    // Same 400ms retry as the title/description, for the same reason (i18n applies
    // just after load) plus one of its own: GameKit resolves its input config when the
    // game calls createInput, which happens after this script runs.
    setTimeout(function(){sendMeta();sendControls();},400);
  }
  if(document.readyState==='loading')addEventListener('DOMContentLoaded',init);else init();
})();`;

// Hide in-game chrome; theater owns title and sound.
// Opaque-origin frames keep this CSS inside the game.
// Fill desktop theater while keeping canvas bounds proportional.
//
// Fit the logical canvas to the iframe without distorting pointer coordinates.
const HIDE_CHROME =
  `#game-title,#game-desc,.game-controls,.hint{display:none!important}` +
  // Hide touch chrome on hover/fine pointers; hybrid touchscreens are not phones.
  `@media (hover:hover),(pointer:fine){` +
  `.gamekit-touch{display:none!important}` +
  `}` +
  `html,body{width:100%;height:100%;margin:0;background:#000}` +
  `body{display:flex;align-items:center;justify-content:center;` +
  `min-height:100%;overflow:hidden}` +
  `.wrap{` +
  `width:100%!important;` +
  `max-width:none!important;` +
  `height:100%!important;` +
  `min-height:100%!important;` +
  `padding:0!important;` +
  `gap:0!important;` +
  `display:flex!important;` +
  `align-items:center!important;` +
  `justify-content:center!important` +
  `}` +
  `#game{` +
  `--gdpl-canvas-ratio:1.6;` +
  `--gdpl-embed-width:100%;` +
  `--gdpl-embed-height:100dvh;` +
  `flex:0 1 auto!important;` +
  `width:min(var(--gdpl-embed-width),calc(var(--gdpl-embed-height) * var(--gdpl-canvas-ratio)))!important;` +
  `height:auto!important;` +
  `aspect-ratio:var(--gdpl-canvas-ratio)!important;` +
  `max-width:var(--gdpl-embed-width)!important;` +
  `max-height:100%!important;` +
  `min-height:0!important;` +
  `box-shadow:none!important` +
  `}` +
  `html,body,canvas,img,video{` +
  `-webkit-touch-callout:none;` +
  `-webkit-user-select:none;` +
  `user-select:none;` +
  `-webkit-tap-highlight-color:transparent;` +
  `touch-action:none;` +
  `overscroll-behavior:none` +
  `}`;

/**
 * Injects the player bridge + hide-chrome style into an assembled game document
 * so it can run headless-of-its-own-chrome inside the app's player.
 *
 * Prefers `<head>` (then `<body>`, then `</body>`, then append) so rAF / AudioContext
 * patches land before game scripts schedule their loops — Studio pause depends on that.
 */
export function embedGameHtml(html: string): string {
  const inject = `<style id="gdpl-embed">${HIDE_CHROME}</style><script>${BRIDGE}</script>`;
  if (/<head\b[^>]*>/i.test(html)) {
    return html.replace(/<head\b[^>]*>/i, (open) => `${open}${inject}`);
  }
  if (/<body\b[^>]*>/i.test(html)) {
    return html.replace(/<body\b[^>]*>/i, (open) => `${open}${inject}`);
  }
  if (html.includes('</body>')) {
    return html.replace('</body>', `${inject}</body>`);
  }
  return html + inject;
}

/**
 * Sends one host message into an embedded game frame.
 *
 * The bridge's contract (`pause`, `resume`, `setSound`, `capture`, `hello`,
 * `snapshotState`, `restoreState`) is useful to callers that want none of the state the
 * hooks below keep — the floating live preview wants to mute and freeze a frame it never
 * subscribes to. Exported because the envelope tag lives only in this file.
 */
export function postGameHostMessage(frame: HTMLIFrameElement | null, message: Record<string, unknown>): void {
  frame?.contentWindow?.postMessage({ source: HOST, ...message }, '*');
}

// Awaits one reply of `type` from `frame`, or null/false after `timeoutMs`.
function awaitBridgeReply<T>(
  frame: HTMLIFrameElement | null,
  type: string,
  extract: (data: Record<string, unknown>) => T,
  fallback: T,
  timeoutMs: number,
): Promise<T> {
  const contentWindow = frame?.contentWindow;
  if (!contentWindow) return Promise.resolve(fallback);
  return new Promise((resolve) => {
    const timer = window.setTimeout(() => {
      window.removeEventListener('message', onMessage);
      resolve(fallback);
    }, timeoutMs);
    function onMessage(event: MessageEvent) {
      if (event.origin !== 'null') return;
      if (event.source !== null && event.source !== contentWindow) return;
      const data = event.data as { source?: string; type?: string } | null;
      if (!data || data.source !== PLAYER || data.type !== type) return;
      window.clearTimeout(timer);
      window.removeEventListener('message', onMessage);
      resolve(extract(data as Record<string, unknown>));
    }
    window.addEventListener('message', onMessage);
  });
}

// Null on a game with no `.persist(...)` declared, or on timeout.
export function requestStateSnapshot(frame: HTMLIFrameElement | null, timeoutMs = 400): Promise<unknown | null> {
  const reply = awaitBridgeReply(frame, 'stateSnapshot', (data) => data.data ?? null, null, timeoutMs);
  postGameHostMessage(frame, { type: 'snapshotState' });
  return reply;
}

// False means the game declined or the request timed out.
export function requestStateRestore(frame: HTMLIFrameElement | null, data: unknown, timeoutMs = 400): Promise<boolean> {
  const reply = awaitBridgeReply(frame, 'stateRestored', (msg) => Boolean(msg.ok), false, timeoutMs);
  postGameHostMessage(frame, { type: 'restoreState', data });
  return reply;
}

/** en/pl are the only locales games ship strings for; anything else maps to en. */
export function toGameLocale(lang: string | undefined | null): Locale {
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
/**
 * The open play session, for shell code that observes something the game cannot report.
 *
 * Zones are the case this exists for: whether an open became a *shared* world is known
 * to the shell (it owns the socket) and must not be reported by the game (a frame that
 * could claim `joined` could claim to be multiplayer while sitting alone). Everything a
 * game may say still arrives over postMessage and is validated there; this is the other
 * direction and is deliberately not reachable from inside the frame.
 *
 * Null between opens, so a stray late call records nothing rather than attaching to
 * whatever game is open next.
 */
let openSession: TelemetrySession | null = null;

/**
 * Take a recorder bound to the session open *now*, for shell code whose callbacks may
 * outlive it.
 *
 * Binding rather than looking the session up per call is the whole point. A WebSocket
 * frame can arrive after the bridge has torn down — `close()` closes the socket
 * asynchronously and the message handler does not check for disposal — so a recorder
 * that dereferenced a module global at callback time would attribute a late snapshot
 * from one game to whichever game opened next, marking a session `joined` that never
 * connected. A bound recorder cannot: once its session closes, `record` refuses, and the
 * stale event lands nowhere instead of on somebody else's row.
 *
 * Returns a no-op when nothing is open, which is the honest outcome — a zone whose
 * `admitted` was never recorded contributes no denominator and so no ratio either.
 */
export function bindPlayRecorder(): (event: TelemetryEvent) => void {
  const session = openSession;
  if (!session) return () => {};
  return (event) => void session.record(event);
}

/**
 * @param active Whether the frame is actually on screen. The game page keeps the frame
 *   mounted while the visitor reads another tab so their run is not restarted, and a
 *   hidden frame that kept accruing `play_time` would inflate focused play time and
 *   every scorecard derived from it. Deliberately **not** folded into `enabled`:
 *   tearing the session down and rebuilding it on each tab switch would emit a fresh
 *   `game_opened` and `play_started` every time, inflating the denominators instead.
 *   Read through a ref so toggling it never re-runs the effect.
 */
export function useGameTelemetry(slug: string, enabled: boolean, slots?: number, active = true, via?: PlayVia) {
  const activeRef = useRef(active);
  useEffect(() => {
    activeRef.current = active;
  }, [active]);

  useEffect(() => {
    if (!enabled) return;

    const session = new TelemetrySession(slug, crypto.randomUUID());
    openSession = session;
    session.record({ type: 'game_opened', ...(slots === undefined ? {} : { slots }) });
    // The same moment, counted in the visit stream — deliberately without the slug, so
    // depth ("did this sitting play a second game") is answerable while "which games did
    // this tab play" stays unanswerable.
    recordVisitEvent({ type: 'play_started', ...(via === undefined ? {} : { via }) });
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
      if (activeRef.current && isPlayTimeAccruing(document)) {
        session.record({ type: 'play_time', seconds: heartbeatSec });
      }
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
        gfxBackend?: 'canvas2d' | 'webgl' | 'webgl3d';
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
          session.record({
            type: 'progress',
            label: String(data.label ?? ''),
            ...(data.gfxBackend === 'canvas2d' || data.gfxBackend === 'webgl' || data.gfxBackend === 'webgl3d'
              ? { gfxBackend: data.gfxBackend }
              : {}),
          });
          break;
        case 'score':
          session.record({ type: 'score', value: Number(data.value) });
          break;
        case 'end':
          if (data.outcome) {
            session.record({
              type: 'end',
              outcome: data.outcome,
              ...(data.gfxBackend === 'canvas2d' || data.gfxBackend === 'webgl' || data.gfxBackend === 'webgl3d'
                ? { gfxBackend: data.gfxBackend }
                : {}),
            });
          }
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
      if (openSession === session) openSession = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- via read via closure
  }, [slug, enabled, slots]);
}

export type GamePlayerMeta = { title: string; desc: string };

/**
 * Subscribes to the player bridge for the currently-embedded game iframe and
 * exposes its title/description, the controls it reports, and a sound toggle the
 * header can drive. `active` gates the subscription so it only runs while a
 * single-player game is on stage.
 */
export function useGamePlayer(
  frameRef: MutableRefObject<HTMLIFrameElement | null>,
  active: boolean,
  /** Called when Escape is pressed *inside* the game (see the bridge's job 4). */
  onEscape?: () => void,
  /** Called on pointerdown inside the game (see the bridge's job 5). */
  onPointer?: () => void,
  /** Called on discrete player input (keydown / pointerdown) so chrome can idle (job 6). */
  onActivity?: () => void,
  /** Called when the game reports a terminal round state. */
  onEnd?: () => void,
  // A pointer or touch is held down, or released.
  onPointerHeldChange?: (held: boolean) => void,
) {
  const [meta, setMeta] = useState<GamePlayerMeta | null>(null);
  const [controls, setControls] = useState<ReportedControls | null>(null);
  const [muted, setMuted] = useState(false);

  // Held in refs so a caller's inline closures can't resubscribe the listener below.
  const onEscapeRef = useRef(onEscape);
  onEscapeRef.current = onEscape;
  const onPointerRef = useRef(onPointer);
  onPointerRef.current = onPointer;
  const onActivityRef = useRef(onActivity);
  onActivityRef.current = onActivity;
  const onEndRef = useRef(onEnd);
  onEndRef.current = onEnd;
  const onPointerHeldChangeRef = useRef(onPointerHeldChange);
  onPointerHeldChangeRef.current = onPointerHeldChange;

  useEffect(() => {
    if (!active) {
      setMeta(null);
      setControls(null);
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
        held?: boolean;
      };
      if (!data || data.source !== PLAYER) return;
      if (data.type === 'meta') {
        setMeta({ title: String(data.title ?? ''), desc: String(data.desc ?? '') });
        setMuted(Boolean(data.muted));
      } else if (data.type === 'controls') {
        // The bridge re-sends this (i18n and GameKit both land after load), so a later
        // report replaces an earlier one — but a report with nothing in it never clears
        // one that had something, or a game that swaps its own chrome would blank the
        // card mid-play.
        const next = readReportedControls(data);
        if (next) setControls(next);
      } else if (data.type === 'sound') {
        setMuted(Boolean(data.muted));
      } else if (data.type === 'key' && data.key === 'Escape') {
        onEscapeRef.current?.();
      } else if (data.type === 'pointer') {
        onPointerRef.current?.();
        onActivityRef.current?.();
      } else if (data.type === 'activity') {
        onActivityRef.current?.();
      } else if (data.type === 'held') {
        onPointerHeldChangeRef.current?.(Boolean(data.held));
      } else if (data.type === 'end') {
        onEndRef.current?.();
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

  return { meta, controls, muted, toggleSound };
}

/** Instrumentation gathered while a creator playtests inside Studio. */
export type PlaytestInstrumentation = {
  playSeconds: number;
  lastAliveFrames: number | null;
  errors: string[];
  progress: string[];
};

export type PlaytestSnapshot = {
  pngBase64: string | null;
  paused: boolean;
  reason: 'pause' | 'capture' | string;
  instrumentation: PlaytestInstrumentation;
};

/**
 * Creator Studio playtest controls over the player bridge.
 *
 * The sandbox has no `allow-same-origin`, so the parent cannot screenshot the
 * frame — pause/capture asks the injected bridge, which replies with a full
 * viewport composite (canvases / videos / images) plus live health fields.
 */
export function useCreatorPlaytest(frameRef: MutableRefObject<HTMLIFrameElement | null>, active: boolean) {
  const [paused, setPaused] = useState(false);
  const [snapshot, setSnapshot] = useState<PlaytestSnapshot | null>(null);
  const [instrumentation, setInstrumentation] = useState<PlaytestInstrumentation>({
    playSeconds: 0,
    lastAliveFrames: null,
    errors: [],
    progress: [],
  });
  const startedAtRef = useRef<number | null>(null);
  const instrumentationRef = useRef(instrumentation);
  instrumentationRef.current = instrumentation;

  useEffect(() => {
    if (!active) {
      setPaused(false);
      setSnapshot(null);
      setInstrumentation({ playSeconds: 0, lastAliveFrames: null, errors: [], progress: [] });
      startedAtRef.current = null;
      return;
    }
    startedAtRef.current = performance.now();

    function onMessage(event: MessageEvent) {
      const data = event.data as {
        source?: string;
        type?: string;
        message?: string;
        frames?: number;
        label?: string;
        png?: string | null;
        paused?: boolean;
        reason?: string;
        aliveFrames?: number;
      };
      if (!data || data.source !== PLAYER) return;

      if (data.type === 'error' && data.message) {
        setInstrumentation((prev) => ({
          ...prev,
          errors: [...prev.errors, String(data.message)].slice(-10),
        }));
        return;
      }
      if (data.type === 'alive') {
        setInstrumentation((prev) => ({
          ...prev,
          lastAliveFrames: Number(data.frames ?? 0),
          playSeconds: startedAtRef.current
            ? Math.max(0, Math.round((performance.now() - startedAtRef.current) / 1000))
            : prev.playSeconds,
        }));
        return;
      }
      if (data.type === 'progress' && data.label) {
        setInstrumentation((prev) => ({
          ...prev,
          progress: [...prev.progress, String(data.label)].slice(-20),
        }));
        return;
      }
      if (data.type === 'snapshot') {
        const live: PlaytestInstrumentation = {
          ...instrumentationRef.current,
          playSeconds: startedAtRef.current
            ? Math.max(0, Math.round((performance.now() - startedAtRef.current) / 1000))
            : instrumentationRef.current.playSeconds,
          lastAliveFrames:
            typeof data.aliveFrames === 'number' ? data.aliveFrames : instrumentationRef.current.lastAliveFrames,
        };
        setInstrumentation(live);
        setPaused(Boolean(data.paused));
        setSnapshot({
          pngBase64: typeof data.png === 'string' && data.png.length > 0 ? data.png : null,
          paused: Boolean(data.paused),
          reason: data.reason ?? 'capture',
          instrumentation: live,
        });
        return;
      }
      if (data.type === 'resumed') {
        setPaused(false);
      }
    }

    window.addEventListener('message', onMessage);
    return () => window.removeEventListener('message', onMessage);
  }, [active]);

  const post = useCallback(
    (message: Record<string, unknown>) => {
      frameRef.current?.contentWindow?.postMessage({ source: HOST, ...message }, '*');
    },
    [frameRef],
  );

  const pause = useCallback(() => post({ type: 'pause' }), [post]);
  const resume = useCallback(() => post({ type: 'resume' }), [post]);
  const capture = useCallback(() => post({ type: 'capture' }), [post]);
  const clearSnapshot = useCallback(() => setSnapshot(null), []);

  return { paused, snapshot, instrumentation, pause, resume, capture, clearSnapshot };
}
