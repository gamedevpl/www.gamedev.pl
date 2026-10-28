export const WORKBENCH_PLAYER_SCRIPT = String.raw`
const requests = new Map();
addEventListener('message', event => {
  const m=event.data;
  if(!m||m.source!=='gdpl-workbench-game'||typeof m.id!=='string')return;
  const p=requests.get(m.id);if(!p||event.source!==p.frame.contentWindow)return;
  clearTimeout(p.timer);requests.delete(m.id);m.error?p.reject(Object.assign(Error(m.error),{definitive:m.definitive===true})):p.resolve(m.data);
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
let swapEpoch=0,lastSwapError='',replacingFrame=false,resourceRecovery=false;
function replacementBusy(){return typeof liveControlled!=='undefined'&&(liveControlled||liveOperation);}
async function hotResources(build){
  const matches=[...build.html.matchAll(/<script type="application\/json" id="gk-hot-resources">([^<]*)<\/script>/g)];
  if(matches.length!==1)throw Error('Missing resource snapshot; restart with update');
  const text=matches[0][1],bytes=new TextEncoder().encode(text);
  if(bytes.byteLength!==build.hot.resources.bytes)throw Error('Update resource size mismatch');
  const digest=await crypto.subtle.digest('SHA-256',bytes);
  if([...new Uint8Array(digest)].map(n=>n.toString(16).padStart(2,'0')).join('')!==build.hot.resources.hash)throw Error('Update resource hash mismatch');
  return JSON.parse(text);
}
async function hotBuild(build,check){
  const target=frame;
  const before=await gameRequest(target,'hot:status');check();
  if(!before||before.bootHash!==build.hot.bootHash)return null;
  if(build.hot.protocol===2&&before.resourceStatus?.available===false)return null;
  if(!before.ready)throw Error('Current game is unavailable. Restart with update to recover.');
  if(liveOperation)throw Error('Wait for the current game operation to finish.');
  const digest=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(build.hot.bundle));check();
  if(liveOperation)throw Error('Wait for the current game operation to finish.');
  if([...new Uint8Array(digest)].map(n=>n.toString(16).padStart(2,'0')).join('')!==build.hot.bundleHash)throw Error('Update code hash mismatch');
  const id=crypto.randomUUID(),previousRevision=revision,expectedEpoch=before.epoch;
  try{
    if(build.hot.protocol===2){
      if(before.protocol!==2)return null;
      const payload=await hotResources(build);check();
      const candidate=await gameRequest(target,'hot:prepare',{...build.hot,id,revision:build.revision,expectedEpoch,payload},18000);check();
      if(candidate.status!=='prepared'){
        if(candidate.reason==='incompatible')return null;
        throw Error(candidate.error||'Resource preparation failed; current build kept');
      }
      if(liveOperation)throw Error('Wait for the current game operation to finish.');
    }
    const transaction=await liveHotUpdate({phase:'begin',id,sourceId,previousRevision,revision:build.revision,expectedEpoch});
    if(transaction.state!=='prepared')throw Error('Update transaction is no longer pending');
    hotUpdating=true;
    try{check();}catch(error){await liveHotUpdate({phase:'abort',id});throw error;}
    let result;
    try{result=await gameRequest(target,'hot:apply',{...build.hot,id,previousRevision,revision:build.revision,expectedEpoch});}
    catch(error){
      if(error.definitive){await liveHotUpdate({phase:'abort',id});throw error;}
      result=await gameRequest(target,'hot:result',{id});if(!result)throw Error('Update outcome uncertain; restart with update to recover.');
    }
    check();
    if(result.status!=='rejected'){
      revision=build.revision;liveEpoch++;
      hotUnavailable=result.status!=='applied';
      el('shown-build').textContent='Build '+revision.slice(0,10);
    }
    const {epoch,runtimeInstanceId,previousRecordingId,recordingId,frame:boundaryFrame,simulationTick}=result;
    const committed=await liveHotUpdate({phase:'finish',id,result:result.status,epoch,runtimeInstanceId,previousRecordingId,recordingId,frame:boundaryFrame,simulationTick});
    if(result.status==='rejected')throw Error(result.error||result.reason||'Candidate rejected');
    if(committed.state!=='committed')throw Error('Update commit could not be confirmed; restart to recover.');
    liveHello();
    el('apply').hidden=true;el('restart').hidden=result.status==='applied';
    lastSwapError=result.status==='applied'?'Code updated · gameplay continued':'Updated code failed to refresh. Restart with update to recover.';
    el('notice').textContent=lastSwapError;
    return result.status==='applied';
  }finally{hotUpdating=false;if(build.hot.protocol===2)await gameRequest(target,'hot:abort',{id}).catch(()=>{});}
}
async function swapBuild(build,force=false,automatic=false) {
  const epoch=++swapEpoch, previous=frame;let next;
  const current=()=>epoch===swapEpoch&&frame===previous;
  const check=()=>{if(!current())throw Error('Update superseded');};
  if(revision&&!force&&build.hot){
    try{const updated=await hotBuild(build,check);if(updated!==null)return updated;}
    catch(error){if(!current())return false;if(/Wait for the current/.test(error.message)&&typeof lastAuto!=='undefined')lastAuto='';lastSwapError=error.message;el('notice').textContent=lastSwapError;el('restart').hidden=false;return false;}
  }
  if(typeof liveControlled!=='undefined'&&liveControlled){el('notice').textContent='Take back control before replacing this game instance.';return false;}
  if(replacementBusy()){el('notice').textContent='Wait for the current game operation to finish.';return false;}
  replacingFrame=true;
  try {
    let saved=null;
    if(revision&&!force) {
      const caps=await gameRequest(previous,'capabilities');check();
      if(!caps.state)throw Error('This game cannot preserve state. Use Restart with update.');
      if((automatic||build.hot?.protocol===2)&&(!caps.validate||!caps.safe)){
        if(caps.validate&&typeof lastAuto!=='undefined')lastAuto='';
        throw Error('Update ready. Apply manually at a safe moment.');
      }
      posture(previous,'pause');
      saved=await gameRequest(previous,'snapshot');check();
      if(JSON.stringify(saved??null).length>1000000)throw Error('State exceeds 1 MB');
      if(saved==null)throw Error('No restorable state. Use Restart with update.');
    }
    next=document.createElement('iframe');next.title='Candidate game';next.setAttribute('sandbox','allow-scripts allow-pointer-lock');
    next.className='game-stage';next.style.visibility='hidden';
    document.body.prepend(next);next.srcdoc=build.html;
    const caps=await ready(next);check();posture(next,'pause');
    if(saved!==null) {
      if(!caps.state||(automatic||build.hot?.protocol===2)&&!caps.validate)throw Error('Candidate cannot safely restore this state');
      const restored=await gameRequest(next,'restore',saved);check();
      if(restored!==true)throw Error('Candidate rejected the saved state');
    }
    posture(next,'resume');
    await new Promise(r=>setTimeout(r,150));
    check();
    if(replacementBusy())throw Error('Game control changed while replacing the instance');
    const focused=document.activeElement===previous||(!revision&&document.activeElement===document.body&&
      el('panel')?.hidden!==false&&el('workbench-tools')?.hidden!==false&&el('code-panel')?.hidden!==false);
    previous.remove();next.style.cssText='';next.id='game';frame=next;
    if(focused)next.focus();
    if(typeof liveRuntimeId!=='undefined')liveRuntimeId=crypto.randomUUID();
    if(typeof hotUnavailable!=='undefined')hotUnavailable=false;
    resourceRecovery=false;
    revision=build.revision;el('shown-build').textContent='Build '+revision.slice(0,10);
    el('empty').hidden=true;el('apply').hidden=true;el('restart').hidden=true;
    lastSwapError='';el('notice').textContent=saved!==null?'Updated · game state restored':'Build loaded';
    el('record').textContent='Enable recording';recording=false;
    return true;
  } catch(error) {
    next?.remove();
    if(!current())return false;
    if(!replacementBusy())posture(previous,'resume');
    lastSwapError=error.message+' Current build kept.';el('notice').textContent=lastSwapError;
    if(revision)el('restart').hidden=false;
    return false;
  }finally{if(epoch===swapEpoch)replacingFrame=false;}
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
