export const LIVE_GAME_SCRIPT = String.raw`
const liveTabId=crypto.randomUUID();
let liveSocket,liveControlled=false,liveOperation=false,liveEpoch=0,liveLeaseTimer;
const liveReplies=new Map();
if(typeof ResizeObserver!=='undefined')new ResizeObserver(()=>{
  const control=el('agent-control');
  document.body.style.setProperty('--live-control-space',control.hidden?'0px':(control.getBoundingClientRect().height+12)+'px');
}).observe(el('agent-control'));
function liveSend(message){if(liveSocket?.readyState===1)liveSocket.send(JSON.stringify(message));}
function liveHello(){liveSend({type:'live:hello',tabId:liveTabId,sourceId,revision});}
function livePost(type,extra={}){frame.contentWindow?.postMessage({source:'gdpl-host',type,...extra},'*');}
function liveRelease(notify=false){
  liveEpoch++;clearTimeout(liveLeaseTimer);liveControlled=false;
  livePost('agent:disable');
  for(const p of liveReplies.values()){clearTimeout(p.timer);p.reject(Error('Control released'));}liveReplies.clear();
  el('agent-control').hidden=true;
  if(notify)liveSend({type:'live:reclaim'});
}
function liveLease(){
  if(!liveControlled)return;
  livePost('agent:heartbeat');clearTimeout(liveLeaseTimer);
  liveLeaseTimer=setTimeout(()=>liveRelease(true),4000);
}
function liveAsk(type,extra={}){
  return new Promise((resolve,reject)=>{
    const id=crypto.randomUUID(),target=frame.contentWindow;
    const timer=setTimeout(()=>{liveReplies.delete(id);reject(Error('Game control unavailable'));},3000);
    liveReplies.set(id,{resolve,reject,timer,target});livePost(type,{...extra,id});
  });
}
addEventListener('message',e=>{
  const m=e.data;if(!m||m.source!=='gdpl-player'||m.type!=='agent:state')return;
  const p=liveReplies.get(m.id);
  if(p&&e.source===p.target){clearTimeout(p.timer);liveReplies.delete(m.id);p.resolve(m);}
  if(e.source===frame.contentWindow&&m.reason==='lease expired')liveRelease(true);
});
async function liveRun(message){
  if(liveOperation){liveSend({type:'live:result',id:message.id,error:'Another game operation is running'});return;}
  liveOperation=true;
  const target=frame,shown=revision,epoch=liveEpoch,args=message.args||{};
  const check=()=>{if(epoch!==liveEpoch||frame!==target||shown!==revision||message.sourceId!==sourceId)throw Error('Game or control changed; observe again');};
  try{
    if(!revision||loading||message.revision!==revision)throw Error('Displayed build changed or is loading');
    check();let observation;
    if(message.operation==='game_take_control'){
      const cap=await gameRequest(frame,'capabilities');check();
      if(!cap.control)throw Error('This game does not expose frame stepping');
      liveControlled=true;el('agent-control').hidden=false;liveLease();
      observation=await liveAsk('agent:enable',{fps:args.fps||60,lease:true});
    }else if(message.operation==='game_release_control'){
      observation=await liveAsk('agent:disable');
      check();liveControlled=false;clearTimeout(liveLeaseTimer);el('agent-control').hidden=true;
    }else if(message.operation==='game_observe'){
      observation=await liveAsk('agent:observe');
    }else if(message.operation==='game_act'){
      if(!liveControlled)throw Error('The agent does not control this game');
      for(const action of args.actions){
        check();observation=await liveAsk('agent:command',{command:action});
        if(observation.reason==='error')throw Error('Game action failed; inspect diagnostics');
      }
    }else throw Error('Unknown game operation');
    check();
    const diagnostics=await gameRequest(frame,'trace');check();
    const png=args.screenshot===false||message.operation==='game_release_control'?undefined:await baseCapture();check();
    const data={observation,diagnostics,png};
    if(JSON.stringify(data).length>3500000)throw Error('Observation exceeds 3.5 MB; request screenshot:false');
    liveSend({type:'live:result',id:message.id,data});
  }catch(error){
    liveRelease();liveSend({type:'live:result',id:message.id,error:String(error.message||error).slice(0,1000)});
  }finally{liveOperation=false;}
}
addEventListener('play-presence-connected',event=>{
  const socket=event.detail;liveSocket=socket;
  socket.addEventListener('open',liveHello);
  socket.addEventListener('message',event=>{
    let message;try{message=JSON.parse(event.data);}catch{return;}
    if(message.type==='live:request')void liveRun(message);
    if(message.type==='live:release')liveRelease();
    if(message.type==='live:lease')liveLease();
  });
  socket.addEventListener('close',()=>{if(liveSocket===socket){liveSocket=undefined;liveRelease();}});
});
el('agent-reclaim').onclick=()=>liveRelease(true);
el('agent-select').onclick=()=>{liveHello();liveSend({type:'live:select'});el('feedback').textContent='This Play tab is selected for the agent.';};
addEventListener('pagehide',()=>liveRelease(true));
setInterval(liveHello,1000);
`;
