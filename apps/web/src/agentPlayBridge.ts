// In-frame executor; see docs/agent-play-mode.md.

// A source fragment, not a module: concatenated into the player bridge.

export const AGENT_BRIDGE = `
  // --- agent play mode ------------------------------------------------------
  var agentOn=false,agentFps=60,agentTilt=null,agentLog=[],agentLiveTimer=0,agentStatusSeen='';
  var AGENT_LOG_CAP=60,AGENT_UI_CAP=80;
  function agentHarness(){return window.__GAME_HARNESS__;}
  function agentCanvas(){return el('game')||largestCanvas();}
  function agentFrameNo(){var h=agentHarness();return h&&typeof h.frame==='number'?h.frame:0;}
  function agentNote(kind,detail){
    agentLog.push({frame:agentFrameNo(),kind:String(kind),detail:String(detail==null?'':detail).slice(0,160)});
    if(agentLog.length>AGENT_LOG_CAP)agentLog.splice(0,agentLog.length-AGENT_LOG_CAP);
  }
  function agentSnapshot(){
    var h=agentHarness(),out={};
    if(!h||!h.metadata)return out;
    for(var k in h.metadata){if(Object.prototype.hasOwnProperty.call(h.metadata,k))out[k]=h.metadata[k];}
    return out;
  }
  function agentUi(){
    try{
      var kit=window.GameKit;
      if(!kit||!kit.ui||typeof kit.ui.affordances!=='function')return [];
      return (kit.ui.affordances()||[]).slice(0,AGENT_UI_CAP);
    }catch(err){return [];}
  }
  // Set at assemble time once the games repo carries AGENT.json's hiddenFields into the
  // document; null until then, and the host renders that as a warning.
  function agentHidden(){
    var list=window.__GAME_AGENT_HIDDEN__;
    if(!list||!list.length)return null;
    var out=[];
    for(var i=0;i<list.length;i++)out.push(String(list[i]));
    return out;
  }
  function agentGoal(){
    // The generated document carries How-to-play as a dt/dd legend; the goal is its
    // first row and the hint is a paragraph. Both are hidden by the host's chrome CSS
    // but still in the DOM, which is the only place the page can read them from.
    var rows=legendRows();
    return {rows:rows,kit:kitRows(),hint:text(document.querySelector('.hint'))};
  }
  function agentState(reason){
    post({
      type:'agent:state',
      reason:reason||'look',
      frame:agentFrameNo(),
      snapshot:agentSnapshot(),
      ui:agentUi(),
      hiddenFields:agentHidden(),
      log:agentLog.slice(-20),
      stepped:paused,
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
  function agentKey(type,key,code){
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
    agentTilt=null;
    agentSetStepped(false);
  }
  function agentRun(command){
    var kind=command&&command.kind;
    if(kind==='look'){agentState('look');return;}
    if(kind==='step'){agentStep(command.frames);agentState('step');return;}
    if(kind==='press'){
      agentKey('keydown',command.key,command.code);
      agentStep(command.frames);
      agentKey('keyup',command.key,command.code);
      agentState('press');
      return;
    }
    if(kind==='tap'){
      // One stepped frame while held, matching the CLI harness — variable-height jumps
      // and other input.down() readers need to see the press land on a frame.
      agentKey('keydown',command.key,command.code);
      agentStep(1);
      agentKey('keyup',command.key,command.code);
      agentState('tap');
      return;
    }
    if(kind==='keyDown'){agentKey('keydown',command.key,command.code);agentState('down');return;}
    if(kind==='keyUp'){agentKey('keyup',command.key,command.code);agentState('up');return;}
    if(kind==='click'){
      agentPointer('pointerdown',command.x,command.y,1,true);
      agentPointer('pointerup',command.x,command.y,0,false);
      agentStep(1);
      agentState('click');
      return;
    }
    if(kind==='move'){agentPointer('pointermove',command.x,command.y,0,false);agentState('move');return;}
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
      agentState('drag');
      return;
    }
    if(kind==='tilt'){
      agentTilt={x:command.x,y:command.y};
      var h=agentHarness();
      if(!h||typeof h.injectSensing!=='function')agentNote('error','this game accepts no tilt');
      agentState('tilt');
      return;
    }
    if(kind==='restart'){
      var harness=agentHarness();
      var ok=!!(harness&&typeof harness.restart==='function'&&harness.restart());
      agentNote('agent',ok?'restarted':'restart refused — the round is not over');
      agentState('restart');
      return;
    }
    if(kind==='playFor'){
      agentSetStepped(false);
      agentNote('agent','running live for '+command.ms+'ms');
      agentLiveTimer=setTimeout(function(){
        agentLiveTimer=0;
        if(!agentOn)return;
        agentSetStepped(true);
        agentState('play');
      },command.ms);
      return;
    }
    if(kind==='live'){agentDisable();agentState('live');return;}
    if(kind==='screenshot'){post({type:'agent:shot',png:capturePng(),frame:agentFrameNo()});agentState('screenshot');return;}
    agentNote('error','unsupported command');
    agentState('error');
  }
  function handleAgentMessage(m){
    if(m.type==='agent:enable'){agentEnable(m.fps);return;}
    if(m.type==='agent:disable'){agentDisable();return;}
    if(m.type!=='agent:command')return;
    if(!agentOn){agentEnable();return;}
    try{agentRun(m.command||{});}
    catch(err){
      agentNote('error',String((err&&err.message)||err));
      agentState('error');
    }
  }
`;
