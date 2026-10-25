// Leased commands yield between frames for heartbeats and reclaim.
export const AGENT_PLAY_COOPERATIVE = `
  var agentPendingCommand=null;
  function agentCancelCommand(){
    if(agentPendingCommand)clearTimeout(agentPendingCommand.timer);
    agentPendingCommand=null;
  }
  function agentRunLeased(command,id){
    if(!agentOn||!agentLeased){agentState('control unavailable',id);return;}
    if(agentPendingCommand){agentState('command busy',id);return;}
    var kind=command.kind;
    if(kind!=='step'&&kind!=='press'&&kind!=='drag'){agentRun(command,id);return;}
    var count=Math.max(1,Math.min(300,Math.floor(Number(command.frames)||1)));
    var run={timer:0,done:0};agentPendingCommand=run;
    if(kind==='press')agentKey('keydown',command.key,command.code);
    if(kind==='drag')agentPointer('pointerdown',command.from.x,command.from.y,1,false);
    function chunk(){
      if(agentPendingCommand!==run||!agentLeased||!agentOn)return;
      var until=performance.now()+12;
      try{
        do{
          if(kind==='drag'){
            var t=(run.done+1)/count;
            agentPointer('pointermove',command.from.x+(command.to.x-command.from.x)*t,
              command.from.y+(command.to.y-command.from.y)*t,1,false);
          }
          agentStep(1);run.done++;
        }while(run.done<count&&performance.now()<until);
        if(run.done<count){run.timer=setTimeout(chunk,0);return;}
        if(kind==='press')agentKey('keyup',command.key,command.code);
        if(kind==='drag')agentPointer('pointerup',command.to.x,command.to.y,0,false);
        agentPendingCommand=null;agentState(kind,id);
      }catch(err){
        agentPendingCommand=null;agentReleaseInput();
        agentNote('error',AGENT_STR((err&&err.message)||err));agentState('error',id);
      }
    }
    chunk();
  }
`;
