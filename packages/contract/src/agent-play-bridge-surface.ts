// Snapshot, widgets, and named helpers. Concatenated into AGENT_PLAY_BRIDGE.

export const AGENT_PLAY_BRIDGE_SURFACE = `
  function agentReadMaybeFn(value){
    if(typeof value==='function'){try{return value();}catch(err){return null;}}
    return value;
  }
  // hiddenFields names a key at any depth, not just the snapshot's top level.
  var AGENT_REDACT_DEPTH=8;
  function agentHiddenKey(hidden,key){
    for(var i=0;i<hidden.length;i++)if(hidden[i]===key)return true;
    return false;
  }
  function agentRedact(value,hidden,depth){
    if(!hidden||!hidden.length||value==null||typeof value!=='object')return value;
    // Past the cap a cycle is likelier than real data; drop rather than risk a leak.
    if(depth>=AGENT_REDACT_DEPTH)return null;
    var i,k,out;
    if(Object.prototype.toString.call(value)==='[object Array]'){
      out=[];
      for(i=0;i<value.length;i++)out.push(agentRedact(value[i],hidden,depth+1));
      return out;
    }
    out={};
    for(k in value){
      if(!Object.prototype.hasOwnProperty.call(value,k))continue;
      if(agentHiddenKey(hidden,k))continue;
      out[k]=agentRedact(value[k],hidden,depth+1);
    }
    return out;
  }
  // The kit stringifies observation before it gets here, so walk into JSON text too.
  function agentRedactMaybeJson(value,hidden){
    if(!hidden||!hidden.length)return value;
    if(typeof value==='string'){
      var parsed;
      try{parsed=JSON.parse(value);}catch(err){return value;}
      if(parsed==null||typeof parsed!=='object')return value;
      try{return JSON.stringify(agentRedact(parsed,hidden,0));}catch(err){return value;}
    }
    return agentRedact(value,hidden,0);
  }
  function agentJsonValue(value,cap){
    if(value==null)return '';
    if(typeof value==='string')return value.slice(0,cap);
    try{return JSON.stringify(value).slice(0,cap);}catch(err){return String(value).slice(0,cap);}
  }
  function agentSnapshot(){
    var h=agentHarness()||{},out={},hidden=agentHidden(),i,meta=h.metadata;
    if(meta){
      for(var k in meta){
        if(!Object.prototype.hasOwnProperty.call(meta,k))continue;
        var skip=false;
        if(hidden)for(i=0;i<hidden.length;i++)if(hidden[i]===k)skip=true;
        if(!skip)out[k]=meta[k];
      }
    }
    var obsHidden=false;
    if(hidden)for(i=0;i<hidden.length;i++)if(hidden[i]==='observation')obsHidden=true;
    if(!obsHidden){
      var obs=out.observation;
      if(obs==null||obs==='')obs=agentReadMaybeFn(h.observation);
      obs=agentRedactMaybeJson(obs,hidden);
      var text=agentJsonValue(obs,16000);
      if(text)out.observation=text;
      else delete out.observation;
    }
    return out;
  }
  function agentNormalizeWidget(raw,w,h){
    if(!raw||typeof raw!=='object')return null;
    var label=String(raw.label||'').slice(0,80);
    if(!label)return null;
    var x1,y1,x2,y2;
    if(typeof raw.x1==='number'){x1=raw.x1;y1=raw.y1;x2=raw.x2;y2=raw.y2;}
    else if(typeof raw.x==='number'&&w>0&&h>0){
      x1=raw.x/w;y1=raw.y/h;x2=(raw.x+Number(raw.width||0))/w;y2=(raw.y+Number(raw.height||0))/h;
    }else return null;
    if(!isFinite(x1)||!isFinite(y1)||!isFinite(x2)||!isFinite(y2)||x2<=x1||y2<=y1)return null;
    var item={label:label,enabled:raw.enabled!==false,x1:x1,y1:y1,x2:x2,y2:y2};
    if(typeof raw.detail==='string')item.detail=String(raw.detail).slice(0,120);
    if(raw.selected===true)item.selected=true;
    return item;
  }
  function agentUiFrom(raw,w,h){
    var list=agentReadMaybeFn(raw),out=[],i,item;
    if(!list||typeof list.length!=='number')return out;
    for(i=0;i<list.length&&out.length<AGENT_UI_CAP;i++){
      item=agentNormalizeWidget(list[i],w,h);
      if(item)out.push(item);
    }
    return out;
  }
  function agentUi(){
    var canvas=agentCanvas();
    var marked=canvas&&canvas.__gkLogicalSize;
    var w=(marked&&marked.width>0)?marked.width:((canvas&&canvas.width)||0);
    var hgt=(marked&&marked.height>0)?marked.height:((canvas&&canvas.height)||0);
    var out=[],seen={},i,item,key;
    function add(list){
      for(i=0;i<list.length&&out.length<AGENT_UI_CAP;i++){
        item=list[i];
        key=item.label+'@'+item.x1+','+item.y1+','+item.x2+','+item.y2;
        if(seen[key])continue;
        seen[key]=1;
        out.push(item);
      }
    }
    try{
      var kit=window.GameKit;
      if(kit&&kit.ui&&typeof kit.ui.affordances==='function')add(agentUiFrom(kit.ui.affordances(),w,hgt));
    }catch(err){}
    try{
      var harness=agentHarness();
      if(harness)add(agentUiFrom(harness.ui,w,hgt));
    }catch(err){}
    return out;
  }
  var AGENT_HARNESS_CORE={version:1,captureMode:1,ready:1,frame:1,metadata:1,signals:1,audio:1,
    record:1,step:1,paint:1,pause:1,resume:1,restart:1,injectSensing:1,screenshot:1,
    snapshotState:1,restoreState:1,ui:1,observation:1,api:1,helpers:1};
  function agentTakeFns(src,into){
    var k;
    if(!src||typeof src!=='object')return;
    for(k in src){
      if(!Object.prototype.hasOwnProperty.call(src,k))continue;
      if(typeof src[k]==='function'&&/^[A-Za-z_][A-Za-z0-9_]*$/.test(k))into[k]=src[k];
    }
  }
  function agentApiTable(){
    var h=agentHarness()||{},table={},k;
    agentTakeFns(h.api,table);
    agentTakeFns(h.helpers,table);
    for(k in h){
      if(!Object.prototype.hasOwnProperty.call(h,k)||AGENT_HARNESS_CORE[k])continue;
      if(typeof h[k]==='function'&&/^[A-Za-z_][A-Za-z0-9_]*$/.test(k))table[k]=h[k];
    }
    return table;
  }
  function agentApiNames(){
    var table=agentApiTable(),names=[],k;
    for(k in table)if(Object.prototype.hasOwnProperty.call(table,k))names.push(String(k).slice(0,40));
    names.sort();
    return names.slice(0,40);
  }
  function agentInvoke(name,args){
    var fn=agentApiTable()[String(name)];
    if(typeof fn!=='function')throw new Error('unknown helper: '+name+' (try agent.api())');
    return fn.apply(null,args||[]);
  }
`;
