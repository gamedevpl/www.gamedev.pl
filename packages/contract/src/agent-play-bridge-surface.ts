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
  // Bound before the game's script runs: every one of these is replaceable, and
  // redaction decides what crosses, so it must not call a game's version of them.
  var AGENT_CALL=Function.prototype.call;
  var AGENT_DATE_ISO=AGENT_CALL.bind(Date.prototype.toISOString);
  var AGENT_HAS=AGENT_CALL.bind(Object.prototype.hasOwnProperty);
  var AGENT_DESC=Object.getOwnPropertyDescriptor;
  var AGENT_IS_ARRAY=Array.isArray;
  var AGENT_JSON=JSON.stringify;
  var AGENT_CUT=AGENT_CALL.bind(String.prototype.slice);
  function agentIsDate(v){
    // The bound intrinsic, against the internal slot only a real Date has.
    try{AGENT_DATE_ISO(v);return true;}catch(err){return false;}
  }
  // No global: self-comparison catches NaN, and the two infinities compare.
  function agentFinite(n){return typeof n==='number'&&n===n&&n!==1/0&&n!==-1/0;}
  // Returns the value the descriptor reported, so what we emit is what we
  // checked: a read would go through a proxy trap the descriptor did not show.
  var AGENT_NO_DATA={};
  function agentDataValue(holder,name){
    try{
      var d=AGENT_DESC(holder,name);
      if(!d||d.get||d.set)return AGENT_NO_DATA;
      return d.value;
    }catch(err){return AGENT_NO_DATA;}
  }
  function agentSafeJson(value,hidden,cap){
    if(value==null)return '';
    // Text the game hands over is text: capped, never inspected. See the docs.
    if(typeof value==='string')return AGENT_CUT(value,0,cap);
    // Written by index and concatenation: push and join are game code too, and
    // push would receive the value we have not redacted yet.
    var names=hidden||[],used=0,stack=[],depth=0;
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
      if(t==='string')return lit(AGENT_JSON(v.length>cap-used?AGENT_CUT(v,0,cap-used+1):v));
      // ''+v, not String(v): the global is writable, and a number needs no hook.
      if(t==='number')return lit(agentFinite(v)?''+v:'null');
      if(t==='boolean')return lit(v?'true':'false');
      // A function, undefined or a symbol has no JSON form: the holder drops it.
      if(t!=='object')return undefined;
      if(agentIsDate(v))return lit(AGENT_JSON(AGENT_DATE_ISO(v)));
      // A cycle would never end; nesting spends the budget, so depth needs no cap.
      for(i=0;i<depth;i++)if(stack[i]===v)throw AGENT_OVER;
      stack[depth++]=v;
      var out,text,val,wrote=0;
      // Array.isArray asks nothing of the value: a toStringTag getter is game code.
      if(AGENT_IS_ARRAY(v)){
        spend(2);
        out='[';
        for(i=0;i<v.length;i++){
          if(i)out+=lit(',');
          // An index can be an accessor, and a slot names nothing.
          if(names.length){
            val=agentDataValue(v,''+i);
            if(val===AGENT_NO_DATA){out+=lit('null');continue;}
          }else{
            try{val=v[i];}catch(err){out+=lit('null');continue;}
          }
          text=write(val);
          out+=(text===undefined?lit('null'):text);
        }
        out+=']';
      }else{
        spend(2);
        var key,name;
        // Enumerated, not collected: a wide object must not cost a key array
        // before the budget has a chance to stop the walk.
        out='{';
        for(name in v){
          // A name we drop still cost a look, inherited ones included.
          spend(1);
          if(!AGENT_HAS(v,name))continue;
          // Named before read: a declared key's getter never runs either.
          if(declared(name))continue;
          // An accessor is game code, and this walk exists so none of it runs.
          // Only where something is declared: with nothing to protect it is the game's.
          if(names.length){
            val=agentDataValue(v,name);
            if(val===AGENT_NO_DATA)continue;
          }else{
            try{val=v[name];}catch(err){continue;}
          }
          text=write(val);
          if(text===undefined)continue;
          // Cut before escaping, like a string value: a key is untrusted too.
          key=AGENT_JSON(name.length>cap-used?AGENT_CUT(name,0,cap-used+1):name);
          spend(key.length+(wrote?2:1));
          if(wrote)out+=',';
          out+=key+':'+text;
          wrote=1;
        }
        out+='}';
      }
      depth--;
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
        if(!AGENT_HAS(meta,k))continue;
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
      if(obs==null||obs==='')obs=agentReadMaybeFn(agentSlot(h,'observation'),h);
      var text=agentSafeJson(obs,hidden,16000);
      if(text)out.observation=text;
      else delete out.observation;
    }
    return out;
  }
  function agentClamp01(v){return v<0?0:(v>1?1:v);}
  function agentNormalizeWidget(raw,w,h){
    if(!raw||typeof raw!=='object')return null;
    var label=typeof raw.label==='string'?AGENT_CUT(raw.label,0,80):'';
    if(!label)return null;
    var x1,y1,x2,y2;
    if(typeof raw.x1==='number'){x1=raw.x1;y1=raw.y1;x2=raw.x2;y2=raw.y2;}
    else if(typeof raw.x==='number'&&w>0&&h>0){
      x1=raw.x/w;y1=raw.y/h;x2=(raw.x+Number(raw.width||0))/w;y2=(raw.y+Number(raw.height||0))/h;
    }else return null;
    if(!agentFinite(x1)||!agentFinite(y1)||!agentFinite(x2)||!agentFinite(y2)||x2<=x1||y2<=y1)return null;
    // Clipped like the kit publisher: click refuses a midpoint outside 0..1.
    x1=agentClamp01(x1);y1=agentClamp01(y1);x2=agentClamp01(x2);y2=agentClamp01(y2);
    if(x2<=x1||y2<=y1)return null;
    var item={label:label,enabled:raw.enabled!==false,x1:x1,y1:y1,x2:x2,y2:y2};
    if(typeof raw.detail==='string')item.detail=AGENT_CUT(raw.detail,0,120);
    if(raw.selected===true)item.selected=true;
    return item;
  }
  function agentUiFrom(raw,w,h,self){
    var list=agentReadMaybeFn(raw,self),out=[],i,item;
    if(!list||typeof list.length!=='number')return out;
    // Entries rejected still cost a look, so bound the scan, not just what it keeps.
    // Compared, not Math.min: that global is writable too.
    var bound=AGENT_UI_CAP*10,len=list.length;
    var scan=(typeof len==='number'&&len<bound)?len:bound;
    for(i=0;i<scan&&out.length<AGENT_UI_CAP;i++){
      // One widget whose field throws costs that widget, not the rest of the list.
      try{item=agentNormalizeWidget(list[i],w,h);}catch(err){continue;}
      if(item)out[out.length]=item;
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
    // Enumeration itself can throw: a registry is the game's object.
    try{
    for(k in src){
      // An inherited name cost a look, so the cap counts it too.
      seen++;
      if(seen>AGENT_API_SCAN)return seen;
      if(!AGENT_HAS(src,k))continue;
      // A registration whose getter throws is skipped, not fatal to the surface.
      try{fn=src[k];}catch(err){continue;}
      // The registry travels with the function: a method that reads this must
      // still get the object it was registered on.
      if(typeof fn==='function'&&/^[A-Za-z_][A-Za-z0-9_]*$/.test(k))into[k]={fn:fn,self:src};
    }
    }catch(err){}
    return seen;
  }
  function agentSlot(holder,name){
    // The registry property itself can be an accessor that throws.
    try{return holder[name];}catch(err){return null;}
  }
  function agentApiTable(){
    var h=agentHarness()||{},k,fn,seen=0;
    var apiSrc=agentSlot(h,'api'),helperSrc=agentSlot(h,'helpers');
    // Even a bounded scan has to enumerate first, so a frame pays for it once.
    if(AGENT_API_MEMO&&AGENT_API_MEMO.h===h&&AGENT_API_MEMO.api===apiSrc&&
      AGENT_API_MEMO.helpers===helperSrc&&AGENT_API_MEMO.frame===h.frame)return AGENT_API_MEMO.table;
    // Null prototype so call constructor misses instead of reaching Object.prototype.
    var table=Object.create(null);
    seen=agentTakeFns(apiSrc,table,seen);
    seen=agentTakeFns(helperSrc,table,seen);
    try{
    for(k in h){
      seen++;
      if(seen>AGENT_API_SCAN)break;
      if(!AGENT_HAS(h,k)||AGENT_HARNESS_CORE[k])continue;
      try{fn=h[k];}catch(err){continue;}
      if(typeof fn==='function'&&/^[A-Za-z_][A-Za-z0-9_]*$/.test(k))table[k]={fn:fn,self:h};
    }
    }catch(err){}
    AGENT_API_MEMO={h:h,api:apiSrc,helpers:helperSrc,frame:h.frame,table:table};
    return table;
  }
  // A repaint can republish a changed registry inside one frame.
  function agentForgetApi(){AGENT_API_MEMO=null;}
  function agentApiNames(){
    var table=agentApiTable(),names=[],k;
    // Skip rather than truncate: a shortened name is one call cannot resolve.
    for(k in table)if(AGENT_HAS(table,k)&&k.length<=40)names[names.length]=k;
    names.sort();
    return names.slice(0,AGENT_API_CAP);
  }
  function agentInvoke(name,args){
    var entry=agentApiTable()[String(name)];
    if(!entry||typeof entry.fn!=='function')throw new Error('unknown helper: '+name+' (try agent.api())');
    return entry.fn.apply(entry.self,args||[]);
  }
`;
