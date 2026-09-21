// Snapshot, widgets, and named helpers. Concatenated into AGENT_PLAY_BRIDGE.

export const AGENT_PLAY_BRIDGE_SURFACE = `
  var AGENT_TOO_LARGE='<withheld: too large>';
  // Called on its owner: a registration written as a method reads this.
  function agentReadMaybeFn(value,self){
    if(typeof value==='function'){try{return value.call(self);}catch(err){return null;}}
    return value;
  }
  // One pass, no parse, no clone: drop declared keys while serializing, and stop
  // the moment the output would exceed its cap. Every earlier shape of this
  // walked or parsed game text first, and each stage grew its own escape hatch.
  var AGENT_OVER={over:1};
  // We do the walking, so no toJSON ever runs: JSON.stringify calls one before any
  // check can see it, and a converter can return a primitive, rename in place or
  // delete itself, so every test of the converted value arrives too late.
  function agentIsDate(v){
    // Our own realm's method, against the internal slot only a real Date has.
    try{Date.prototype.toISOString.call(v);return true;}catch(err){return false;}
  }
  function agentIsData(holder,name){
    try{
      var d=Object.getOwnPropertyDescriptor(holder,name);
      return !!d&&!d.get&&!d.set;
    }catch(err){return false;}
  }
  function agentSafeJson(value,hidden,cap){
    if(value==null)return '';
    // Text the game hands over is text: capped, never inspected. See the docs.
    if(typeof value==='string')return value.slice(0,cap);
    var names=hidden||[],used=0,stack=[];
    function declared(k){
      for(var i=0;i<names.length;i++)if(names[i]===k)return true;
      return false;
    }
    // Every character is spent once, so the budget is the output length exactly.
    function spend(n){used+=n;if(used>cap)throw AGENT_OVER;return n;}
    function lit(text){spend(text.length);return text;}
    function write(v){
      var t=typeof v,i;
      if(v===null)return lit('null');
      // Cut to what the budget could still hold before escaping: escaping only
      // grows a string, so a cut one that no longer fits never fitted either.
      if(t==='string')return lit(JSON.stringify(v.length>cap-used?v.slice(0,cap-used+1):v));
      if(t==='number')return lit(isFinite(v)?String(v):'null');
      if(t==='boolean')return lit(v?'true':'false');
      // A function, undefined or a symbol has no JSON form: the holder drops it.
      if(t!=='object')return undefined;
      if(agentIsDate(v))return lit(JSON.stringify(Date.prototype.toISOString.call(v)));
      // A cycle would never end; nesting spends the budget, so depth needs no cap.
      for(i=0;i<stack.length;i++)if(stack[i]===v)throw AGENT_OVER;
      stack.push(v);
      var parts=[],out,text;
      if(Object.prototype.toString.call(v)==='[object Array]'){
        spend(2);
        for(i=0;i<v.length;i++){
          if(i)spend(1);
          text=write(v[i]);
          parts.push(text===undefined?lit('null'):text);
        }
        out='['+parts.join(',')+']';
      }else{
        spend(2);
        var key,name,val;
        // Enumerated, not collected: a wide object must not cost a key array
        // before the budget has a chance to stop the walk.
        for(name in v){
          if(!Object.prototype.hasOwnProperty.call(v,name))continue;
          // A key we drop still cost a look, so looking spends too.
          spend(1);
          // Named before read: a declared key's getter never runs either.
          if(declared(name))continue;
          // An accessor is game code, and this walk exists so none of it runs.
          // Only where something is declared: with nothing to protect it is the game's.
          if(names.length&&!agentIsData(v,name))continue;
          try{val=v[name];}catch(err){continue;}
          text=write(val);
          if(text===undefined)continue;
          // Cut before escaping, like a string value: a key is untrusted too.
          key=JSON.stringify(name.length>cap-used?name.slice(0,cap-used+1):name);
          spend(key.length+(parts.length?2:1));
          parts.push(key+':'+text);
        }
        out='{'+parts.join(',')+'}';
      }
      stack.pop();
      return out;
    }
    var result;
    try{result=write(value);}catch(err){return AGENT_TOO_LARGE;}
    if(result===undefined)return '';
    // Never sliced: a cut JSON string is not JSON. Withhold instead.
    if(result.length>cap)return AGENT_TOO_LARGE;
    return result;
  }
  function agentSnapshot(){
    var h=agentHarness()||{},out={},hidden=agentHidden(),i,meta=h.metadata;
    if(meta){
      for(var k in meta){
        if(!Object.prototype.hasOwnProperty.call(meta,k))continue;
        var skip=false;
        if(hidden)for(i=0;i<hidden.length;i++)if(hidden[i]===k)skip=true;
        if(skip)continue;
        var value;
        // Read once: a getter that answers differently twice would place the
        // second answer in the snapshot without it ever passing redaction.
        try{value=meta[k];}catch(err){continue;}
        // A nested declared key rides inside an object value, so serialize it here.
        out[k]=(value!==null&&typeof value==='object')?agentSafeJson(value,hidden,16000):value;
      }
    }
    var obsHidden=false;
    if(hidden)for(i=0;i<hidden.length;i++)if(hidden[i]==='observation')obsHidden=true;
    if(!obsHidden){
      var obs=out.observation;
      if(obs==null||obs==='')obs=agentReadMaybeFn(h.observation,h);
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
  function agentUiFrom(raw,w,h,self){
    var list=agentReadMaybeFn(raw,self),out=[],i,item;
    if(!list||typeof list.length!=='number')return out;
    // Entries rejected still cost a look, so bound the scan, not just what it keeps.
    var scan=Math.min(list.length,AGENT_UI_CAP*10);
    for(i=0;i<scan&&out.length<AGENT_UI_CAP;i++){
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
      if(kit&&kit.ui&&typeof kit.ui.affordances==='function')add(agentUiFrom(kit.ui.affordances(),w,hgt,kit.ui));
    }catch(err){}
    try{
      var harness=agentHarness();
      if(harness)add(agentUiFrom(harness.ui,w,hgt,harness));
    }catch(err){}
    return out;
  }
  var AGENT_HARNESS_CORE={version:1,captureMode:1,ready:1,frame:1,metadata:1,signals:1,audio:1,
    record:1,step:1,paint:1,pause:1,resume:1,restart:1,injectSensing:1,screenshot:1,
    snapshotState:1,restoreState:1,ui:1,observation:1,api:1,helpers:1};
  // Entries we reject still cost a look, so the scan is bounded, not just the keep.
  var AGENT_API_CAP=40,AGENT_API_SCAN=AGENT_API_CAP*10;
  var AGENT_API_MEMO=null;
  function agentTakeFns(src,into,seen){
    var k,fn;
    if(!src||typeof src!=='object')return seen;
    for(k in src){
      if(seen>=AGENT_API_SCAN)return seen;
      if(!Object.prototype.hasOwnProperty.call(src,k))continue;
      seen++;
      // A registration whose getter throws is skipped, not fatal to the surface.
      try{fn=src[k];}catch(err){continue;}
      // The registry travels with the function: a method that reads this must
      // still get the object it was registered on.
      if(typeof fn==='function'&&/^[A-Za-z_][A-Za-z0-9_]*$/.test(k))into[k]={fn:fn,self:src};
    }
    return seen;
  }
  function agentApiTable(){
    var h=agentHarness()||{},k,fn,seen=0;
    // Even a bounded scan has to enumerate first, so a frame pays for it once.
    if(AGENT_API_MEMO&&AGENT_API_MEMO.h===h&&AGENT_API_MEMO.api===h.api&&
      AGENT_API_MEMO.helpers===h.helpers&&AGENT_API_MEMO.frame===h.frame)return AGENT_API_MEMO.table;
    // Null prototype so call constructor misses instead of reaching Object.prototype.
    var table=Object.create(null);
    seen=agentTakeFns(h.api,table,seen);
    seen=agentTakeFns(h.helpers,table,seen);
    for(k in h){
      if(seen>=AGENT_API_SCAN)break;
      if(!Object.prototype.hasOwnProperty.call(h,k)||AGENT_HARNESS_CORE[k])continue;
      seen++;
      try{fn=h[k];}catch(err){continue;}
      if(typeof fn==='function'&&/^[A-Za-z_][A-Za-z0-9_]*$/.test(k))table[k]={fn:fn,self:h};
    }
    AGENT_API_MEMO={h:h,api:h.api,helpers:h.helpers,frame:h.frame,table:table};
    return table;
  }
  // A repaint can republish a changed registry inside one frame.
  function agentForgetApi(){AGENT_API_MEMO=null;}
  function agentApiNames(){
    var table=agentApiTable(),names=[],k;
    // Skip rather than truncate: a shortened name is one call cannot resolve.
    for(k in table)if(Object.prototype.hasOwnProperty.call(table,k)&&String(k).length<=40)names.push(String(k));
    names.sort();
    return names.slice(0,AGENT_API_CAP);
  }
  function agentInvoke(name,args){
    var entry=agentApiTable()[String(name)];
    if(!entry||typeof entry.fn!=='function')throw new Error('unknown helper: '+name+' (try agent.api())');
    return entry.fn.apply(entry.self,args||[]);
  }
`;
