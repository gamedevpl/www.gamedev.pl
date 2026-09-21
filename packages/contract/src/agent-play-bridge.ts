// Agent play executor; see the website's docs/agent-play-mode.md.

// Served only to reviewers, so other documents lack it.

// Takes the player bridge's helpers off window.__GDPL_BRIDGE__.

import { AGENT_PLAY_BRIDGE_SURFACE } from './agent-play-bridge-surface.js';

export const AGENT_PLAY_BRIDGE =
  `(function(){
  'use strict';
  var host=window.__GDPL_BRIDGE__;
  if(!host)return;
  var post=host.post,el=host.el,text=host.text,setPaused=host.setPaused;
  var capturePng=host.capturePng,legendRows=host.legendRows,kitRows=host.kitRows;
  var largestCanvas=host.largestCanvas;
  var agentOn=false,agentFps=60,agentTilt=null,agentLog=[],agentLiveTimer=0,agentStatusSeen='';
  var agentAudioSeq=0,agentAudioCount=0;
  var AGENT_LOG_CAP=60,AGENT_UI_CAP=80;
  function agentHarness(){return window.__GAME_HARNESS__;}
  function agentCanvas(){return el('game')||largestCanvas();}
  function agentFrameNo(){var h=agentHarness();return h&&typeof h.frame==='number'?h.frame:0;}
  // frame is optional: a replayed signal carries the frame it happened on, not now.
  function agentNote(kind,detail,frame){
    var at=typeof frame==='number'&&isFinite(frame)?frame:agentFrameNo();
    agentLog[agentLog.length]={frame:at,kind:String(kind),detail:AGENT_CUT(String(detail==null?'':detail),0,160)};
    if(agentLog.length>AGENT_LOG_CAP)agentLog.splice(0,agentLog.length-AGENT_LOG_CAP);
  }
  // Redacted here, not on the host: a hidden answer must not cross the bridge at all.
  // A policy runs in the game's own realm and can still read the harness directly;
  // that hole is documented rather than pretended away.
` +
  AGENT_PLAY_BRIDGE_SURFACE +
  `
  // Set at assemble time once the games repo carries AGENT.json's hiddenFields into the
  // document; null until then, and the host renders that as a warning.
  function agentHidden(){
    var list=window.__GAME_AGENT_HIDDEN__;
    if(!list||!list.length)return null;
    var out=[];
    // By index: a replaced push could silently drop a declared name.
    for(var i=0;i<list.length;i++)out[out.length]=String(list[i]);
    return out;
  }
  function agentGoal(){
    // The generated document carries How-to-play as a dt/dd legend; the goal is its
    // first row and the hint is a paragraph. Both are hidden by the host's chrome CSS
    // but still in the DOM, which is the only place the page can read them from.
    var rows=legendRows();
    return {rows:rows,kit:kitRows(),hint:text(document.querySelector('.hint'))};
  }
  // Sound the game asked for, read from harness.audio — the agent has no speakers.
  // Its own log, so a noisy game cannot evict a progress landmark from signals.
  // Cursor is the entry's own seq, never its index: the log is capped and drops its
  // oldest, so once full its length stops moving and an index cursor would go deaf.
  // The cursor also carries how much of that entry was reported: repeats of one name
  // in one frame keep growing the newest entry, so a read one can still grow.
  var AGENT_AUDIO_KINDS={sfx:1,loop:1,music:1};
  function agentNoteAudio(entry,count){
    if(!entry||typeof entry.name!=='string'||!entry.name)return;
    if(!Object.prototype.hasOwnProperty.call(AGENT_AUDIO_KINDS,entry.type))return;
    agentNote(entry.type,entry.name
      +(count>1?' x'+count:'')
      +(entry.stopped?' (stopped)':'')
      +(entry.missing?' (missing)':''),
      Number(entry.frame));
  }
  function agentDrainAudio(){
    var h=agentHarness(),log=h&&h.audio,i,entry,seq,total,fresh;
    if(!log||typeof log.length!=='number')return;
    var highest=agentAudioSeq,reported=agentAudioCount;
    for(i=0;i<log.length;i++){
      entry=log[i];
      seq=entry&&typeof entry.seq==='number'?entry.seq:-1;
      if(seq<agentAudioSeq)continue;
      total=Number(entry.count);
      if(!(total>1))total=1;
      fresh=seq===agentAudioSeq?total-agentAudioCount:total;
      if(fresh<=0)continue;
      if(seq>highest){highest=seq;reported=total;}
      else if(seq===highest)reported=total;
      agentNoteAudio(entry,fresh);
    }
    agentAudioSeq=highest;
    agentAudioCount=reported;
  }
  function agentState(reason,id){
    agentDrainAudio();
    post({
      type:'agent:state',
      reason:reason||'look',
      id:id===undefined?null:id,
      frame:agentFrameNo(),
      snapshot:agentSnapshot(),
      ui:agentUi(),
      api:agentApiNames(),
      hiddenFields:agentHidden(),
      log:AGENT_ARGS(agentLog,-20),
      stepped:host.isPaused(),
      fps:agentFps
    });
  }
  function agentStep(count){
    var h=agentHarness();
    if(!h||typeof h.step!=='function'){agentNote('error','this game exposes no harness — step is unavailable');return;}
    var dt=1/agentFps;
    for(var i=0;i<count;i++){
      if(agentTilt&&typeof h.injectSensing==='function'){try{h.injectSensing({tilt:agentTilt});}catch(err){}}
      try{h.step(dt,{present:true});}catch(err){agentNote('error',String((err&&err.message)||err));break;}
    }
  }
  var AGENT_KEY_ALIASES={left:{key:'ArrowLeft',code:'ArrowLeft'},right:{key:'ArrowRight',code:'ArrowRight'},
    up:{key:'ArrowUp',code:'ArrowUp'},down:{key:'ArrowDown',code:'ArrowDown'},space:{key:' ',code:'Space'},
    enter:{key:'Enter',code:'Enter'},escape:{key:'Escape',code:'Escape'}};
  function agentResolveKey(token){
    var raw=String(token==null?'':token);
    var lower=raw.toLowerCase();
    if(Object.prototype.hasOwnProperty.call(AGENT_KEY_ALIASES,lower))return AGENT_KEY_ALIASES[lower];
    if(raw.length===1)return {key:raw.toLowerCase(),code:'Key'+raw.toUpperCase()};
    return {key:raw,code:raw};
  }
  // Held input we synthesized, so closing the mode cannot hand a human a stuck key.
  var agentHeldKeys=[],agentPointerIsDown=false,agentPointerAt={x:0,y:0};
  function agentNoteHeld(type,key,code){
    var i;
    if(type==='keydown'){
      for(i=0;i<agentHeldKeys.length;i++)if(agentHeldKeys[i].key===key)return;
      agentHeldKeys[agentHeldKeys.length]={key:key,code:code};
      return;
    }
    // Rebuilt, not spliced: a key left held is an input the reviewer cannot clear.
    var keep=[];
    for(i=0;i<agentHeldKeys.length;i++)if(agentHeldKeys[i].key!==key)keep[keep.length]=agentHeldKeys[i];
    agentHeldKeys=keep;
  }
  function agentReleaseInput(){
    var held=AGENT_ARGS(agentHeldKeys,0);
    for(var i=0;i<held.length;i++)agentKey('keyup',held[i].key,held[i].code);
    agentHeldKeys=[];
    if(agentPointerIsDown){
      agentPointer('pointerup',agentPointerAt.x,agentPointerAt.y,0,false);
      agentPointerIsDown=false;
    }
    agentTilt=null;
  }
  function agentKey(type,key,code){
    agentNoteHeld(type,key,code);
    var target=agentCanvas()||window,ev;
    try{ev=new KeyboardEvent(type,{key:key,code:code,bubbles:true,cancelable:true});}
    catch(err){
      try{ev=document.createEvent('Event');ev.initEvent(type,true,true);ev.key=key;ev.code=code;}
      catch(err2){return;}
    }
    try{target.dispatchEvent(ev);}catch(err){}
  }
  // Inverse of GameKit's mapClientToBitmap: 0..1 of the *bitmap*, letterboxing included.
  function agentClientPoint(canvas,x,y){
    var rect=canvas.getBoundingClientRect();
    var marked=canvas.__gkLogicalSize;
    var lw=(marked&&marked.width>0)?marked.width:(canvas.width||rect.width||1);
    var lh=(marked&&marked.height>0)?marked.height:(canvas.height||rect.height||1);
    var scale=Math.min(rect.width/lw,rect.height/lh);
    var offsetX=(rect.width-lw*scale)/2,offsetY=(rect.height-lh*scale)/2;
    return {x:rect.left+offsetX+x*lw*scale,y:rect.top+offsetY+y*lh*scale};
  }
  function agentPointer(type,x,y,buttons,synthesizeClick){
    var canvas=agentCanvas();
    if(!canvas){agentNote('error','no canvas to point at');return;}
    if(type==='pointerdown'){agentPointerIsDown=true;agentPointerAt={x:x,y:y};}
    else if(type==='pointerup'){agentPointerIsDown=false;}
    else if(agentPointerIsDown){agentPointerAt={x:x,y:y};}
    var at=agentClientPoint(canvas,x,y);
    var init={bubbles:true,cancelable:true,clientX:at.x,clientY:at.y,pointerId:1,pointerType:'mouse',
      isPrimary:true,button:0,buttons:buttons};
    var ev=null;
    try{ev=new PointerEvent(type,init);}catch(err){
      var mouse=type==='pointerdown'?'mousedown':(type==='pointerup'?'mouseup':'mousemove');
      try{ev=new MouseEvent(mouse,init);}catch(err2){return;}
    }
    try{canvas.dispatchEvent(ev);}catch(err){}
    if(type==='pointerdown'&&synthesizeClick){
      try{canvas.dispatchEvent(new MouseEvent('click',init));}catch(err){}
    }
  }
  function agentSetStepped(stepped){
    if(agentLiveTimer){clearTimeout(agentLiveTimer);agentLiveTimer=0;}
    // veil:false — the pause overlay would land in every screenshot the agent takes.
    setPaused(stepped,{veil:false,snapshot:false});
  }
  function agentWatchStatus(){
    // #game-status is GameKit's own aria-live line (announce()). It is the one text
    // channel a published game already writes to, so it costs nothing to relay.
    var node=el('game-status');
    if(!node||!('MutationObserver'in window))return;
    new MutationObserver(function(){
      if(!agentOn)return;
      var value=String(node.textContent||'').trim();
      if(!value||value===agentStatusSeen)return;
      agentStatusSeen=value;
      agentNote('announce',value);
    }).observe(node,{childList:true,characterData:true,subtree:true});
  }
  function agentEnable(fps){
    var next=Number(fps);
    if(isFinite(next)&&next>=1&&next<=240)agentFps=Math.round(next);
    if(!agentOn){agentOn=true;agentWatchStatus();agentNote('agent','agent mode on — time is yours');}
    agentSetStepped(true);
    var help=agentGoal();
    post({
      type:'agent:hello',
      title:text(el('game-title')),
      desc:text(el('game-desc')),
      controls:help,
      fps:agentFps,
      harness:!!(agentHarness()&&typeof agentHarness().step==='function'),
      hiddenFields:agentHidden()
    });
    agentState('hello');
  }
  function agentDisable(){
    if(!agentOn)return;
    agentOn=false;
    agentReleaseInput();
    agentSetStepped(false);
  }
  function agentRun(command,id){
    var kind=command&&command.kind;
    if(kind==='look'){agentState('look',id);return;}
    if(kind==='call'){
      try{
        var result=agentInvoke(command.name,command.args||[]);
        // Redacted before the note, which is what crosses the bridge. The value the
        // policy gets is not: a policy runs in the game's realm and is exempt anyway.
        var shown=agentSafeJson(result,agentHidden(),140);
        agentNote('call',String(command.name)+' '+AGENT_CUT(String(shown),0,140));
      }catch(err){
        // A thrown message is game-authored text we do not inspect, so a game
        // that declares hidden fields gets the failure without the message.
        var hid=agentHidden();
        var why=(hid&&hid.length)?'helper failed':AGENT_CUT(String((err&&err.message)||err),0,140);
        agentNote('error',String(command.name)+': '+why);
      }
      // A helper mutates the round; republish without advancing time.
      try{var ph=agentHarness();if(ph&&typeof ph.paint==='function')ph.paint();}catch(err){}
      agentForgetApi();
      agentState('call',id);
      return;
    }
    if(kind==='step'){agentStep(command.frames);agentState('step',id);return;}
    if(kind==='press'){
      agentKey('keydown',command.key,command.code);
      agentStep(command.frames);
      agentKey('keyup',command.key,command.code);
      agentState('press',id);
      return;
    }
    if(kind==='tap'){
      // One stepped frame while held, matching the CLI harness — variable-height jumps
      // and other input.down() readers need to see the press land on a frame.
      agentKey('keydown',command.key,command.code);
      agentStep(1);
      agentKey('keyup',command.key,command.code);
      agentState('tap',id);
      return;
    }
    if(kind==='keyDown'){agentKey('keydown',command.key,command.code);agentState('down',id);return;}
    if(kind==='keyUp'){agentKey('keyup',command.key,command.code);agentState('up',id);return;}
    if(kind==='click'){
      agentPointer('pointerdown',command.x,command.y,1,true);
      agentPointer('pointerup',command.x,command.y,0,false);
      agentStep(1);
      agentState('click',id);
      return;
    }
    if(kind==='move'){agentPointer('pointermove',command.x,command.y,0,false);agentState('move',id);return;}
    if(kind==='drag'){
      agentPointer('pointerdown',command.from.x,command.from.y,1,false);
      for(var i=1;i<=command.frames;i++){
        var t=i/command.frames;
        agentPointer('pointermove',
          command.from.x+(command.to.x-command.from.x)*t,
          command.from.y+(command.to.y-command.from.y)*t,1,false);
        agentStep(1);
      }
      agentPointer('pointerup',command.to.x,command.to.y,0,false);
      agentState('drag',id);
      return;
    }
    if(kind==='tilt'){
      agentTilt={x:command.x,y:command.y};
      var h=agentHarness();
      if(!h||typeof h.injectSensing!=='function')agentNote('error','this game accepts no tilt');
      agentState('tilt',id);
      return;
    }
    if(kind==='restart'){
      var harness=agentHarness();
      var ok=!!(harness&&typeof harness.restart==='function'&&harness.restart());
      agentNote('agent',ok?'restarted':'restart refused — the round is not over');
      agentState('restart',id);
      return;
    }
    if(kind==='playFor'){
      agentSetStepped(false);
      agentNote('agent','running live for '+command.ms+'ms');
      agentLiveTimer=setTimeout(function(){
        agentLiveTimer=0;
        if(!agentOn)return;
        agentSetStepped(true);
        agentState('play',id);
      },command.ms);
      return;
    }
    if(kind==='live'){agentDisable();agentState('live',id);return;}
    if(kind==='screenshot'){post({type:'agent:shot',id:id===undefined?null:id,png:capturePng(),frame:agentFrameNo()});agentState('screenshot',id);return;}
    agentNote('error','unsupported command');
    agentState('error',id);
  }

  // --- policy scripts -------------------------------------------------------
  // A declarative plan cannot branch, so playing anything real needs a policy the
  // reviewer writes. It runs here, in the frame, because a decision per frame costs
  // microseconds here and a postMessage round trip from the host.
  var AGENT_LOG_LINES=400,AGENT_WATCH_POINTS=400,AGENT_WALL_MS=20000;
  function agentPolicyApi(budget,logs,watches,shots){
    var used=0,startedAt=Date.now();
    function note(kind,args){
      if(logs.length>=AGENT_LOG_LINES)return;
      var parts=[];
      for(var i=0;i<args.length;i++){
        var value=args[i];
        try{parts[parts.length]=(typeof value==='string'?value:AGENT_JSON(value));}
        catch(err){parts[parts.length]=String(value);}
      }
      logs[logs.length]={frame:agentFrameNo(),kind:kind,text:AGENT_CUT(AGENT_JOIN(parts,' '),0,400)};
    }
    function spend(count){
      used+=count;
      if(used>budget)throw new Error('the policy used its whole budget of '+budget+' frames');
      if(Date.now()-startedAt>AGENT_WALL_MS)throw new Error('the policy ran longer than '+AGENT_WALL_MS+'ms');
    }
    var api={
      // Time. Drawing is off by default: simulating without it is far cheaper,
      // and nothing needs a painted frame until something looks at one.
      step:function(count,draw){
        var n=Math.max(1,Math.floor(Number(count)||1));
        spend(n);
        var h=agentHarness();
        if(!h||typeof h.step!=='function')throw new Error('this game exposes no harness');
        for(var i=0;i<n;i++){
          if(agentTilt&&typeof h.injectSensing==='function'){try{h.injectSensing({tilt:agentTilt});}catch(err){}}
          h.step(1/agentFps,{present:draw===true});
        }
        return api.state();
      },
      paint:function(){var h=agentHarness();if(h&&typeof h.paint==='function')h.paint();agentForgetApi();},
      frame:function(){return agentFrameNo();},
      framesUsed:function(){return used;},
      framesLeft:function(){return Math.max(0,budget-used);},
      // What the game says about itself, redacted the same way look is.
      state:function(){return agentSnapshot();},
      observation:function(){
        var raw=agentSnapshot().observation;
        if(typeof raw!=='string')return null;
        try{return JSON.parse(raw);}catch(err){return raw;}
      },
      ui:function(){return agentUi();},
      api:function(){return agentApiNames();},
      // Forgotten after: a helper can register another without a frame passing.
      call:function(name){
        try{return agentInvoke(name,AGENT_ARGS(arguments,1));}
        finally{agentForgetApi();}
      },
      // Input, same verbs the command box has.
      press:function(key,frames,draw){
        var resolved=agentResolveKey(key);
        agentKey('keydown',resolved.key,resolved.code);
        api.step(frames||1,draw);
        agentKey('keyup',resolved.key,resolved.code);
        return api.state();
      },
      tap:function(key){return api.press(key,1);},
      down:function(key){var r=agentResolveKey(key);agentKey('keydown',r.key,r.code);},
      up:function(key){var r=agentResolveKey(key);agentKey('keyup',r.key,r.code);},
      click:function(x,y){
        agentPointer('pointerdown',x,y,1,true);
        agentPointer('pointerup',x,y,0,false);
        return api.step(1);
      },
      move:function(x,y){agentPointer('pointermove',x,y,0,false);},
      drag:function(x1,y1,x2,y2,frames){
        var n=Math.max(1,Math.floor(Number(frames)||1));
        agentPointer('pointerdown',x1,y1,1,false);
        for(var i=1;i<=n;i++){
          var t=i/n;
          agentPointer('pointermove',x1+(x2-x1)*t,y1+(y2-y1)*t,1,false);
          api.step(1);
        }
        agentPointer('pointerup',x2,y2,0,false);
        return api.state();
      },
      tilt:function(x,y){agentTilt={x:Number(x)||0,y:Number(y)||0};},
      restart:function(){var h=agentHarness();return !!(h&&typeof h.restart==='function'&&h.restart());},
      // Debugging, which is the point: a run you cannot see into teaches nothing.
      log:function(){note('log',arguments);},
      // A named series sampled over the run — a trajectory, not a snapshot.
      watch:function(name,value){
        if(watches.length>=AGENT_WATCH_POINTS)return;
        var reading;
        try{reading=typeof value==='function'?value():value;}catch(err){reading='error: '+String(err&&err.message||err);}
        watches[watches.length]={frame:agentFrameNo(),name:AGENT_CUT(String(name),0,40),value:reading};
      },
      // A painted frame, kept for the answer. Paints first: stepping does not draw.
      capture:function(name){
        api.paint();
        shots[shots.length]={name:AGENT_CUT(String(name||('frame '+agentFrameNo())),0,60),frame:agentFrameNo(),png:capturePng()};
      },
      // The game's own globals, for a policy that needs more than the snapshot.
      game:function(){return window.GameKit;},
      canvas:function(){return agentCanvas();}
    };
    return api;
  }
  function agentRunPolicy(code,budget){
    var logs=[],watches=[],shots=[];
    var api=agentPolicyApi(Math.max(1,Math.min(Number(budget)||3600,20000)),logs,watches,shots);
    var startedAt=Date.now();
    var outcome='completed',message=null;
    // Console inside the frame is invisible to the host, so borrow it for the run.
    var realConsole={log:console.log,warn:console.warn,error:console.error};
    function relay(kind){return function(){api.log.apply(null,arguments);void kind;};}
    try{
      console.log=relay('log');console.warn=relay('warn');console.error=relay('error');
      window.__AGENT__=api;
      window.playAgent=undefined;
      // An inline script first: repo-lane documents and API-assembled ones are served
      // with different CSP, and this is the path that runs under both.
      var el=document.createElement('script');
      el.textContent=code;
      el.setAttribute('data-agent-policy','1');
      document.documentElement.appendChild(el);
      el.remove();
      // Where script elements do not execute, indirect eval still might; where neither
      // does, the policy simply never defined anything and the message below says so.
      if(typeof window.playAgent!=='function'&&typeof window.__AGENT_POLICY__!=='function'){
        try{(0,eval)(code);}catch(err){}
      }
      if(typeof window.playAgent==='function'){
        window.playAgent(api);
      }else if(typeof window.__AGENT_POLICY__==='function'){
        window.__AGENT_POLICY__(api);
      }else{
        throw new Error('the policy defined no playAgent(agent) function');
      }
    }catch(err){
      outcome='failed';
      message=AGENT_CUT(String((err&&err.stack)||(err&&err.message)||err),0,600);
    }finally{
      agentReleaseInput();
      console.log=realConsole.log;console.warn=realConsole.warn;console.error=realConsole.error;
      try{delete window.__AGENT__;}catch(err){window.__AGENT__=undefined;}
    }
    post({
      type:'agent:policy-result',
      outcome:outcome,
      message:message,
      frames:api.framesUsed(),
      ms:Date.now()-startedAt,
      logs:logs,
      watches:watches,
      shots:shots,
      snapshot:agentSnapshot(),
      hiddenFields:agentHidden()
    });
    agentState('policy');
  }

  function handleAgentMessage(m){
    if(m.type==='agent:enable'){agentEnable(m.fps);return;}
    if(m.type==='agent:policy'){if(!agentOn)agentEnable();agentRunPolicy(String(m.code||''),m.budget);return;}
    if(m.type==='agent:disable'){agentDisable();return;}
    if(m.type!=='agent:command')return;
    if(!agentOn){agentEnable();return;}
    try{agentRun(m.command||{},m.id);}
    catch(err){
      agentNote('error',String((err&&err.message)||err));
      agentState('error',m.id);
    }
  }

  addEventListener('message',function(e){
    var m=e.data||{};
    if(!m||m.source!=='gdpl-host')return;
    if(typeof m.type!=='string'||m.type.indexOf('agent:')!==0)return;
    handleAgentMessage(m);
  });
})();`;
