export const WORKBENCH_PLAYER_SCRIPT = String.raw`
const requests = new Map();
addEventListener('message', event => {
  const m=event.data;
  if(!m||m.source!=='gdpl-workbench-game'||typeof m.id!=='string')return;
  const p=requests.get(m.id);if(!p||event.source!==p.frame.contentWindow)return;
  clearTimeout(p.timer);requests.delete(m.id);m.error?p.reject(Error(m.error)):p.resolve(m.data);
});
function gameRequest(target,type,data,timeout=3000) {
  return new Promise((resolve,reject)=>{
    const id=crypto.randomUUID();
    const timer=setTimeout(()=>{requests.delete(id);reject(Error('Game bridge unavailable'));},timeout);
    requests.set(id,{frame:target,resolve,reject,timer});
    target.contentWindow.postMessage({source:'gdpl-workbench',id,type,data},'*');
  });
}
function posture(target,type){target.contentWindow?.postMessage({source:'gdpl-host',type},'*');}
async function ready(target) {
  for(let i=0;i<30;i++) {
    const cap=await gameRequest(target,'capabilities').catch(()=>null);
    if(cap?.ready)return cap;
    await new Promise(r=>setTimeout(r,100));
  }
  throw Error('Candidate did not become ready');
}
let swapEpoch=0,lastSwapError='';
async function swapBuild(build,force=false,automatic=false) {
  const epoch=++swapEpoch, previous=frame;let next;
  try {
    let saved=null;
    if(revision&&!force) {
      const caps=await gameRequest(previous,'capabilities');
      if(!caps.state)throw Error('This game cannot preserve state. Use Restart with update.');
      if(automatic&&(!caps.validate||!caps.safe))throw Error('Update ready. Apply manually at a safe moment.');
      posture(previous,'pause');
      saved=await gameRequest(previous,'snapshot');
      if(JSON.stringify(saved??null).length>1000000)throw Error('State exceeds 1 MB');
      if(saved==null)throw Error('No restorable state. Use Restart with update.');
    }
    next=document.createElement('iframe');next.title='Candidate game';next.setAttribute('sandbox','allow-scripts allow-pointer-lock');
    next.style.cssText='position:fixed;inset:0;width:100%;height:100%;border:0;visibility:hidden';
    document.body.prepend(next);next.srcdoc=build.html;
    const caps=await ready(next);posture(next,'pause');
    if(epoch!==swapEpoch)throw Error('Update superseded');
    if(saved!==null) {
      if(!caps.state||automatic&&!caps.validate)throw Error('Candidate cannot safely restore this state');
      if(await gameRequest(next,'restore',saved)!==true)throw Error('Candidate rejected the saved state');
    }
    posture(next,'resume');
    await new Promise(r=>setTimeout(r,150));
    if(epoch!==swapEpoch)throw Error('Update superseded');
    previous.remove();next.style.cssText='';next.id='game';frame=next;
    revision=build.revision;el('shown-build').textContent='Build '+revision.slice(0,10);
    el('empty').hidden=true;el('apply').hidden=true;el('restart').hidden=true;
    lastSwapError='';el('notice').textContent=saved!==null?'Updated · game state restored':'Build loaded';
    el('record').textContent='Enable recording';recording=false;
    return true;
  } catch(error) {
    next?.remove();posture(previous,'resume');
    lastSwapError=error.message+' Current build kept.';el('notice').textContent=lastSwapError;
    if(revision)el('restart').hidden=false;
    return false;
  }
}
let recording=false;
async function baseCapture() {
  return new Promise((resolve,reject)=>{
    const target=frame.contentWindow;
    const done=e=>{if(e.source!==target||e.data?.source!=='gdpl-player'||(e.data.type!=='snapshot'||e.data.reason!=='capture'))return;
      clearTimeout(timer);removeEventListener('message',done);e.data.png?resolve(e.data.png):reject(Error('Screenshot unavailable'));};
    const timer=setTimeout(()=>{removeEventListener('message',done);reject(Error('Screenshot timed out'));},3000);
    addEventListener('message',done);posture(frame,'capture');
  });
}
`;
