// Installed only in local Play, before game code schedules frames.
export const LIVE_JOURNAL_BRIDGE = String.raw`
(() => {
  const recordingId=crypto.randomUUID(),startedAt=Date.now(),started=performance.now();
  const stringify=JSON.stringify.bind(JSON),parse=JSON.parse.bind(JSON);
  let seq=0,queue=[],bytes=0,dropped=0,stopped=false,lastFrame=-1,lastHarness,slowUntil=0,agent=false,cleanup=false,command=null;
  const held=new Set(),wrapped=new WeakSet(),unwrappable=new WeakSet(),seenLogs=new WeakMap(),tails={};
  const harness=()=>window.__GAME_HARNESS__;
  const frame=()=>{const value=Number(harness()?.frame);return Number.isFinite(value)?Math.max(0,Math.floor(value)):0;};
  function append(kind,data){
    if(stopped)return;
    const entry={seq:++seq,timeMs:performance.now()-started,frame:frame(),kind,data};
    let json;
    try{json=stringify(entry);}catch{dropped++;return;}
    if(json.length>128000||bytes+json.length>1000000||queue.length>=4096){dropped++;return;}
    queue.push({seq:entry.seq,json});bytes+=json.length;
  }
  function gap(reason,detail={}){append('gap',{reason,...detail});}
  function sample(reason){if(stopped)return;try{capture(reason);}catch(error){gap('Recorder hook failed',{message:String(error).slice(0,500)});}}
  function flush(){
    if(stopped||!queue.length)return;
    const batch=[];let size=0;
    for(const item of queue){if(batch.length>=256||size+item.json.length>256000)break;batch.push(item.json);size+=item.json.length;}
    parent.postMessage({source:'gdpl-journal',recordingId,startedAt,json:'['+batch.join(',')+']'},'*');
  }
  function drain(kind,list){
    if(!Array.isArray(list))return;
    if(tails[kind]&&list.length>=400&&!list.includes(tails[kind]))gap(kind+' log rotated before collection');
    for(const item of list){
      if(!item||typeof item!=='object')continue;
      const count=item.count??1;
      if(seenLogs.get(item)===count)continue;
      append(kind,item);seenLogs.set(item,count);
    }
    tails[kind]=list.at(-1);
  }
  function capture(reason){
    const h=harness();if(!h?.ready)return;
    installStep(h);
    drain('signal',h.signals);drain('audio',h.audio);
    const current=frame();if(h===lastHarness&&current===lastFrame)return;
    if(performance.now()<slowUntil)return;
    const before=performance.now();
    if(h===lastHarness&&lastFrame>=0&&current>lastFrame+1)gap('Unsampled frames',{fromFrame:lastFrame+1,toFrame:current-1});
    if(h!==lastHarness||current<lastFrame)append('lifecycle',{event:'frame-origin',previousFrame:lastFrame});
    lastHarness=h;lastFrame=current;
    try{
      let persistedState=null,stateStatus='unsupported';
      if(typeof h.snapshotState==='function'){
        try{
          persistedState=h.snapshotState();stateStatus=persistedState==null?'unavailable':'available';
          if(persistedState&&typeof persistedState.then==='function'){persistedState=null;stateStatus='unsupported';gap('Async snapshots are unsupported');}
        }
        catch(error){stateStatus='error';gap('snapshotState failed',{message:String(error).slice(0,500)});}
      }
      let observation=h.observation;
      if(typeof observation==='function')observation=observation.call(h);
      const data={reason,metadata:h.metadata??null,observation:observation??null,persistedState,stateStatus,heldKeys:[...held],actor:agent?'agent':'player'};
      const json=stringify(data);
      if(json.length>120000)gap('State exceeds 120000 characters',{stateStatus,characters:json.length});
      else append('state',parse(json));
    }catch(error){gap('State serialization failed',{message:String(error).slice(0,500)});}
    const cost=performance.now()-before;
    if(cost>4){slowUntil=performance.now()+100;gap('State sampling exceeded 4 ms; cooling down for 100 ms',{costMs:cost});}
  }
  function installStep(h){
    const step=h.step;if(typeof step!=='function'||wrapped.has(step)||unwrappable.has(step))return;
    function measured(...args){
      try{return step.apply(this,args);}
      catch(error){append('error',{phase:'step',command,message:String(error).slice(0,2000),stack:String(error?.stack||'').slice(0,4000)});throw error;}
      finally{sample('step');}
    }
    wrapped.add(measured);
    try{h.step=measured;}catch{}
    if(h.step!==measured){unwrappable.add(step);gap('Harness step cannot be instrumented');}
  }
  const raf=window.requestAnimationFrame.bind(window);
  window.requestAnimationFrame=callback=>raf(now=>{try{callback(now);}finally{sample('frame');}});
  for(const type of ['keydown','keyup','pointerdown','pointerup','pointermove','pointercancel','wheel']){
    addEventListener(type,event=>{
      const actor=event.isTrusted?'player':agent?'agent':cleanup?'player':'synthetic';
      const blocked=event.isTrusted&&agent;
      if(!blocked&&type==='keydown')held.add(event.code||event.key);
      if(!blocked&&type==='keyup')held.delete(event.code||event.key);
      const data={type,actor,blocked,cleanup,command,heldKeys:[...held],alt:event.altKey,ctrl:event.ctrlKey,meta:event.metaKey,shift:event.shiftKey};
      if(type.startsWith('key'))Object.assign(data,{key:event.key,code:event.code,repeat:event.repeat});
      else Object.assign(data,{x:event.clientX/innerWidth,y:event.clientY/innerHeight,button:event.button,buttons:event.buttons,pointerType:event.pointerType,deltaX:event.deltaX,deltaY:event.deltaY});
      append('input',data);
    },{capture:true,passive:true});
  }
  addEventListener('error',event=>append('error',{message:String(event.message).slice(0,2000),stack:String(event.error?.stack||'').slice(0,4000)}));
  addEventListener('unhandledrejection',event=>append('error',{message:String(event.reason).slice(0,2000),stack:String(event.reason?.stack||'').slice(0,4000)}));
  for(const level of ['log','info','warn','error','debug']){
    const original=console[level];
    console[level]=function(...args){
      if(stopped)return original.apply(this,args);
      try{append('console',{level,args:args.map(value=>{try{return parse(stringify(value));}catch{return String(value).slice(0,2000);}})});}catch{}
      return original.apply(this,args);
    };
  }
  addEventListener('message',event=>{
    if(event.source!==parent)return;
    const m=event.data;if(!m)return;
    if(m.source==='gdpl-host'){
      if(m.type==='agent:enable')sample('take-control');
      if(m.type==='agent:command'){command=m.id;append('lifecycle',{event:'action',command,action:m.command});}
    }
    if(m.source==='gdpl-journal-host'&&m.recordingId===recordingId){
      if(m.stopped){stopped=true;queue=[];bytes=0;return;}
      let advanced=false;
      queue=queue.filter(item=>{if(item.seq>m.through)return true;advanced=true;bytes-=item.json.length;return false;});
      if(dropped&&bytes<500000){const count=dropped;dropped=0;gap('Recorder buffer overflow or unserializable entry',{count});}
      if(advanced)flush();
    }
  },true);
  addEventListener('gdpl-agent-control',event=>{
    const phase=event.detail?.phase;
    if(phase==='taking')cleanup=true;
    if(phase==='acquired'){cleanup=false;agent=true;append('lifecycle',{event:'take-control'});}
    if(phase==='releasing')cleanup=true;
    if(phase==='released'){cleanup=false;agent=false;command=null;append('lifecycle',{event:'release-control'});}
  });
  addEventListener('blur',()=>{append('lifecycle',{event:'blur',heldKeys:[...held]});});
  addEventListener('pagehide',()=>{append('lifecycle',{event:'pagehide'});flush();});
  document.addEventListener('visibilitychange',()=>append('lifecycle',{event:'visibility',value:document.visibilityState}));
  document.addEventListener('gdpl-resume',()=>{agent=false;command=null;append('lifecycle',{event:'resume'});});
  append('lifecycle',{event:'recording-start',stateSource:'harness metadata, observation and optional snapshotState; not a JavaScript heap',screenshotHistory:false});
  addEventListener('DOMContentLoaded',()=>{
    const h=harness();append('lifecycle',{event:'harness-capabilities',present:!!h,ready:!!h?.ready,snapshotState:typeof h?.snapshotState==='function'});
    sample('ready');
  });
  setInterval(()=>{sample('poll');flush();},250);
})();`;
