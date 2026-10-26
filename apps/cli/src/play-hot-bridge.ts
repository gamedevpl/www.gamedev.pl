export const PLAY_HOT_BRIDGE = String.raw`
(() => {
  const results=new Map();
  let preparing=false,unavailable=false;
  function runtime(){return window.__GAME_HOT__;}
  function status(){const hot=runtime();return hot?.protocol===1&&hot.controller?{protocol:1,bootHash:hot.bootHash,...hot.controller.status(),...(unavailable?{ready:false}:{})}:null;}
  function failed(){
    if(unavailable||preparing||!runtime()?.controller?.status().epoch)return;
    unavailable=true;
    const h=window.__GAME_HARNESS__;h?.pause?.();if(h){h.ready=false;h.metadata={};delete h.ui;delete h.observation;delete h.api;delete h.helpers;}
    parent.postMessage({source:'gdpl-workbench-hot',type:'unavailable'},'*');
  }
  addEventListener('error',failed);addEventListener('unhandledrejection',failed);
  function apply(input){
    if(!input||typeof input.id!=='string'||input.id.length>80||typeof input.bundle!=='string'||input.bundle.length>1000000)
      throw Error('Invalid hot candidate');
    if(results.has(input.id)){
      const previous=results.get(input.id);
      if(previous.revision!==input.revision||previous.bundleHash!==input.bundleHash)throw Error('Update ID reused');
      return previous.result;
    }
    if(results.size>=256)throw Error('Update history capacity reached; restart Play');
    const hot=runtime(),before=status(),journal=window.__GAME_JOURNAL_HOT__;
    if(!before||!before.ready||!journal||input.bootHash!==before.bootHash||input.expectedEpoch!==before.epoch)
      throw Error('Hot runtime, boot fingerprint or epoch changed');
    let token,result;
    const {id,previousRevision,revision,expectedEpoch,stateVersion,observationVersion}=input;
    journal.begin({id,previousRevision,revision,expectedEpoch,stateVersion,observationVersion});
    preparing=true;
    try{
      hot.register=value=>{if(token)throw Error('Candidate registered more than once');token=value;};
      hot.preparationError=undefined;
      const script=document.createElement('script');
      script.textContent='try{'+input.bundle+'\n}catch(error){window.__GAME_HOT__.preparationError=String(error)}';
      const failed=event=>{hot.preparationError=String(event.message||'Candidate script failed');};
      addEventListener('error',failed);
      try{document.head.append(script);}finally{script.remove();removeEventListener('error',failed);delete hot.register;}
      if(hot.preparationError||!token)throw Error(hot.preparationError||'Candidate did not register');
      result=hot.controller.replace(token,input.expectedEpoch);
    }catch(error){result={status:'rejected',reason:'preparation',error:String(error).slice(0,1000),...hot.controller.status()};}
    finally{preparing=false;delete hot.preparationError;delete hot.register;}
    const recording=journal.finish(result);
    result={...result,...recording};
    results.set(input.id,{revision:input.revision,bundleHash:input.bundleHash,result});
    return result;
  }
  addEventListener('message',event=>{
    const m=event.data;
    if(event.source!==parent||m?.source!=='gdpl-workbench'||typeof m.id!=='string'||!['hot:status','hot:apply','hot:result'].includes(m.type))return;
    let data,error;
    try{data=m.type==='hot:status'?status():m.type==='hot:result'?results.get(m.data?.id)?.result:apply(m.data);}
    catch(e){error=String(e.message||e).slice(0,1000);}
    parent.postMessage({source:'gdpl-workbench-game',id:m.id,data,error},'*');
  });
})();`;
