// Local Play leases expire even when their host disappears.
export const AGENT_PLAY_LEASE = `
  var agentLeaseTimer=0,agentLeased=false,agentPhysicalKeys={},agentPhysicalPointers={},agentLeaseFinishing=false;
  var agentRaf=window.requestAnimationFrame,agentCaf=window.cancelAnimationFrame,agentRafSeq=0,agentRafIds={};
  if(agentRaf&&agentCaf){
    window.requestAnimationFrame=function(cb){
      var id=++agentRafSeq;
      function run(now){
        if(agentLeased){agentRafIds[id]=agentRaf.call(window,run);return;}
        delete agentRafIds[id];cb(now);
      }
      agentRafIds[id]=agentRaf.call(window,run);return id;
    };
    window.cancelAnimationFrame=function(id){
      if(Object.prototype.hasOwnProperty.call(agentRafIds,id)){agentCaf.call(window,agentRafIds[id]);delete agentRafIds[id];}
    };
  }
  function agentHeartbeat(){
    clearTimeout(agentLeaseTimer);
    if(agentLeased)agentLeaseTimer=setTimeout(function(){agentDisable();agentState('lease expired');},5000);
  }
  function agentLeaseEvent(phase){try{dispatchEvent(new CustomEvent('gdpl-agent-control',{detail:{phase:phase}}));}catch(err){}}
  function agentLeaseStart(){
    agentLeaseEvent('taking');
    agentLeased=true;
    for(var key in agentPhysicalKeys)agentKey('keyup',key,agentPhysicalKeys[key]);
    agentPhysicalKeys={};
    for(var id in agentPhysicalPointers){
      var event=agentPhysicalPointers[id];
      event.target.dispatchEvent(new PointerEvent('pointerup',{bubbles:true,pointerId:event.pointerId,pointerType:event.pointerType,clientX:event.clientX,clientY:event.clientY,button:event.button,buttons:0}));
      event.target.dispatchEvent(new MouseEvent('mouseup',{bubbles:true,button:event.button,buttons:0}));
    }
    agentPhysicalPointers={};
    agentHeartbeat();agentLeaseEvent('acquired');
  }
  function agentLeaseEnd(){agentLeaseFinishing=agentLeased;if(agentLeased)agentLeaseEvent('releasing');clearTimeout(agentLeaseTimer);agentLeased=false;}
  function agentLeaseReleased(){if(agentLeaseFinishing){agentLeaseFinishing=false;agentLeaseEvent('released');}}
  ['keydown','keyup','pointerdown','pointerup','pointermove','pointercancel','mousedown','mouseup','touchstart','touchmove','touchend','click','wheel'].forEach(function(type){
    addEventListener(type,function(event){
      if(!event.isTrusted)return;
      if(agentLeased){event.preventDefault();event.stopImmediatePropagation();return;}
      if(type==='keydown')agentPhysicalKeys[event.key]=event.code;
      if(type==='keyup')delete agentPhysicalKeys[event.key];
      if(type==='pointerdown')agentPhysicalPointers[event.pointerId]=event;
      if(type==='pointerup'||type==='pointercancel')delete agentPhysicalPointers[event.pointerId];
    },{capture:true,passive:false});
  });
  addEventListener('pagehide',function(){if(agentLeased)agentDisable();});
`;
