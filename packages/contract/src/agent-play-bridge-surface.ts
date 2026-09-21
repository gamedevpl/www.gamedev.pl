// Snapshot, widgets, and named helpers. Concatenated into AGENT_PLAY_BRIDGE.

export const AGENT_PLAY_BRIDGE_SURFACE = `
  var AGENT_TOO_LARGE='<withheld: too large>';
  function agentReadMaybeFn(value){
    if(typeof value==='function'){try{return value();}catch(err){return null;}}
    return value;
  }
  // One pass, no parse, no clone: drop declared keys while serializing, and stop
  // the moment the output would exceed its cap. Every earlier shape of this
  // walked or parsed game text first, and each stage grew its own escape hatch.
  var AGENT_OVER={over:1};
  function agentSafeJson(value,hidden,cap){
    if(value==null)return '';
    // Text the game hands over is text: capped, never inspected. See the docs.
    if(typeof value==='string')return value.slice(0,cap);
    var names=hidden||[],used=0;
    function keep(key,val){
      for(var i=0;i<names.length;i++)if(names[i]===key)return undefined;
      // Keys and punctuation cost too; escaping is settled by the exact check below.
      used+=key.length+4;
      used+=(typeof val==='string')?val.length+2:8;
      // Thrown, not returned: an undefined array entry serializes as null and walks on.
      if(used>cap)throw AGENT_OVER;
      return val;
    }
    var text;
    // A cycle throws here too; nesting spends the budget, so depth needs no cap.
    try{text=JSON.stringify(value,keep);}catch(err){return AGENT_TOO_LARGE;}
    // Never sliced: a cut JSON string is not JSON. Withhold instead.
    if(typeof text!=='string'||text.length>cap)return AGENT_TOO_LARGE;
    return text;
  }
  function agentSnapshot(){
    var h=agentHarness()||{},out={},hidden=agentHidden(),i,meta=h.metadata;
    if(meta){
      for(var k in meta){
        if(!Object.prototype.hasOwnProperty.call(meta,k))continue;
        var skip=false;
        if(hidden)for(i=0;i<hidden.length;i++)if(hidden[i]===k)skip=true;
        if(skip)continue;
        // A nested declared key rides inside an object value, so serialize it here.
        out[k]=(meta[k]!==null&&typeof meta[k]==='object')?agentSafeJson(meta[k],hidden,16000):meta[k];
      }
    }
    var obsHidden=false;
    if(hidden)for(i=0;i<hidden.length;i++)if(hidden[i]==='observation')obsHidden=true;
    if(!obsHidden){
      var obs=out.observation;
      if(obs==null||obs==='')obs=agentReadMaybeFn(h.observation);
      var text=agentSafeJson(obs,hidden,16000);
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
    // Null prototype so call constructor misses instead of reaching Object.prototype.
    var h=agentHarness()||{},table=Object.create(null),k;
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
    // Skip rather than truncate: a shortened name is one call cannot resolve.
    for(k in table)if(Object.prototype.hasOwnProperty.call(table,k)&&String(k).length<=40)names.push(String(k));
    names.sort();
    return names.slice(0,40);
  }
  function agentInvoke(name,args){
    var fn=agentApiTable()[String(name)];
    if(typeof fn!=='function')throw new Error('unknown helper: '+name+' (try agent.api())');
    return fn.apply(null,args||[]);
  }
`;
