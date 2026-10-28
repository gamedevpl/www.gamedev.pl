export const PLAY_HOT_BRIDGE = String.raw`
(() => {
  const results=new Map();
  let preparing=false,unavailable=false,prepared;
  function reject(message){throw Object.assign(Error(message),{definitive:true});}
  function runtime(){return window.__GAME_HOT__;}
  function status(){const hot=runtime();return [1,2].includes(hot?.protocol)&&hot.controller?{protocol:hot.protocol,bootHash:hot.bootHash,...hot.controller.status(),...(unavailable?{ready:false}:{})}:null;}
  function receipt(id){
    const result=results.get(id)?.result,current=status();
    if(result&&result.status!=='rejected'&&current?.epoch===result.epoch&&!current.ready)
      return {...result,status:'failed',ready:false,error:result.error||'Committed code is no longer available'};
    return result;
  }
  function abort(id){
    if(!prepared||id&&prepared.input.id!==id)return;
    clearTimeout(prepared.timer);runtime()?.controller?.discard?.();prepared=undefined;
  }
  function failed(){
    if(unavailable||preparing||!runtime()?.controller)return;
    unavailable=true;abort();
    const h=window.__GAME_HARNESS__;h?.pause?.();if(h){h.ready=false;h.metadata={};delete h.ui;delete h.observation;delete h.api;delete h.helpers;}
    parent.postMessage({source:'gdpl-workbench-hot',type:'unavailable'},'*');
  }
  addEventListener('error',failed);addEventListener('unhandledrejection',failed);
  addEventListener('gdpl-resource-unavailable',()=>{
    unavailable=true;abort();window.__GAME_HARNESS__?.pause?.();
    parent.postMessage({source:'gdpl-workbench-hot',type:'unavailable',resources:true},'*');
  });
  function valid(input){
    if(!input||typeof input.id!=='string'||input.id.length>80||typeof input.bundle!=='string'||input.bundle.length>1000000)
      reject('Invalid hot candidate');
    const before=status();
    if(!before||!before.ready||input.bootHash!==before.bootHash||input.expectedEpoch!==before.epoch)
      reject('Hot runtime, boot fingerprint or epoch changed');
    return before;
  }
  function same(a,b){return a.id===b.id&&a.revision===b.revision&&a.bundleHash===b.bundleHash&&a.resources?.hash===b.resources?.hash&&a.expectedEpoch===b.expectedEpoch;}
  function definition(input){
    const hot=runtime();let token;
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
      return token;
    }finally{preparing=false;delete hot.preparationError;delete hot.register;}
  }
  async function prepare(input){
    const before=valid(input),hot=runtime();
    if(input.protocol!==2||before.protocol!==2||!hot.controller.stage)reject('Resource HMR needs a newer runtime');
    if(prepared&&same(prepared.input,input))return prepared.promise;
    abort();
    const job={input};prepared=job;
    job.timer=setTimeout(()=>abort(input.id),20000);
    job.promise=(async()=>{
      try{
        const token=definition(input);
        const result=await hot.controller.stage(token,input.expectedEpoch,input.payload);
        if(prepared!==job)return {status:'rejected',reason:'superseded'};
        window.__GAME_JOURNAL_HOT__?.resourcePreparation?.(input,result);
        if(result.status!=='prepared'){abort(input.id);return result;}
        job.definition=token;job.token=result.token;
        return {status:'prepared'};
      }catch(error){if(prepared===job)abort(input.id);return {status:'rejected',reason:'preparation',error:String(error).slice(0,1000)};}
    })();
    return job.promise;
  }
  function apply(input){
    if(results.has(input?.id)){
      const previous=results.get(input.id);
      if(!same(previous.input,input))reject('Update ID reused');
      return receipt(input.id);
    }
    const before=valid(input);
    if(results.size>=256)reject('Update history capacity reached; restart Play');
    const hot=runtime(),journal=window.__GAME_JOURNAL_HOT__;
    if(!journal)reject('Hot journal unavailable');
    const staged=input.protocol===2?prepared:undefined;
    if(input.protocol===2&&(!staged||!same(staged.input,input)||!staged.token||before.protocol!==2))reject('Prepared resources expired or changed');
    if(staged)clearTimeout(staged.timer);
    let result;
    const {id,previousRevision,revision,expectedEpoch,stateVersion,observationVersion,bootHash,bundleHash,sourceTreeHash,protocol,resources}=input;
    journal.begin({id,previousRevision,revision,expectedEpoch,stateVersion,observationVersion,bootHash,bundleHash,sourceTreeHash,protocol,...(resources?{resourceHash:resources.hash}:{})});
    try{
      result=hot.controller.replace(staged?staged.definition:definition(input),input.expectedEpoch,staged?.token);
    }catch(error){result={status:'rejected',reason:'preparation',error:String(error).slice(0,1000),...hot.controller.status()};}
    finally{if(staged)abort(input.id);}
    const recording=journal.finish(result);
    result={...result,...recording};
    const {bundle,payload,...identity}=input;
    results.set(input.id,{input:identity,result});
    return result;
  }
  addEventListener('message',event=>{
    const m=event.data;
    if(event.source!==parent||m?.source!=='gdpl-workbench'||typeof m.id!=='string'||!['hot:status','hot:apply','hot:result','hot:prepare','hot:abort'].includes(m.type))return;
    function reply(data,error,definitive=false){parent.postMessage({source:'gdpl-workbench-game',id:m.id,data,error,definitive},'*');}
    try{
      const data=m.type==='hot:status'?status():m.type==='hot:result'?receipt(m.data?.id):m.type==='hot:abort'?abort(m.data?.id):m.type==='hot:prepare'?prepare(m.data):apply(m.data);
      if(data&&typeof data.then==='function')data.then(value=>reply(value),error=>reply(undefined,String(error.message||error).slice(0,1000),error.definitive===true));
      else reply(data);
    }catch(error){reply(undefined,String(error.message||error).slice(0,1000),error.definitive===true);}
  });
})();`;
