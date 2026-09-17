// Envelope tags distinguish the trusted host from sandbox messages.
const HOST = 'gdpl-host';
const PLAYER = 'gdpl-player';

// Shared opaque-frame bridge used by Studio and local Play.
const BRIDGE = `(function(){
  // Shared with GameKit's postSignal — lets the host tell a fresh document from a resend.
  window.__GDPL_LOAD_ID__=window.__GDPL_LOAD_ID__||Math.random();
  function el(id){return document.getElementById(id);}
  function post(m){m.source='${PLAYER}';m.loadId=window.__GDPL_LOAD_ID__;parent.postMessage(m,'*');}
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
  // options.veil:false freezes without the dimming overlay, and options.snapshot:false
  // without the PNG round trip — agent play mode pauses on every command, and both would
  // otherwise show up in the screenshots it takes and in its per-command cost.
  function setPaused(next,options){
    var veil=!(options&&options.veil===false);
    var wantSnapshot=!(options&&options.snapshot===false);
    if(next===paused){if(next&&wantSnapshot)sendSnapshot('pause');return;}
    paused=next;
    if(paused){
      // Snapshot first — then veil — so the overlay never lands in the PNG.
      var png=wantSnapshot?capturePng():null;
      document.dispatchEvent(new CustomEvent('gdpl-pause'));
      if(veil)showOverlay();
      suspendAudio(true);
      if(wantSnapshot)sendSnapshot('pause',png);
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
  // Handle for the agent script, which cannot share this closure.

  // Grants the game nothing: it can already post, capture and stop itself.
  window.__GDPL_BRIDGE__={
    post:post,el:el,text:text,setPaused:setPaused,capturePng:capturePng,
    legendRows:legendRows,kitRows:kitRows,largestCanvas:largestCanvas,
    isPaused:function(){return paused;}
  };
})();`;

// Fit the logical canvas proportionally; the trusted host owns outer chrome.
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

// Inject before game scripts so pause intercepts their animation loops.
export function embedGameHtml(html: string, agentBridge?: string | null): string {
  // Appended, not concatenated: without it there is no agent code.
  const agent = agentBridge ? `<script>${agentBridge}</script>` : '';
  const inject = `<style id="gdpl-embed">${HIDE_CHROME}</style><script>${BRIDGE}</script>${agent}`;
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
