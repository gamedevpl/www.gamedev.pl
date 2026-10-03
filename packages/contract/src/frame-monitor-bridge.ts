// Samples the iframe cadence; GameKit's counter additionally measures presented frames.
export const FRAME_MONITOR_BRIDGE = `
  var perfStart=performance.now(),perfPrevious=null,perfBins=[0,0,0,0,0,0,0,0];
  var perfMax=0,perfDirty=true,perfActive=false,perfContext=null,perfRendered=null,perfCanvas=null,perfState=null,perfWidth=0,perfHeight=0,perfDpr=1;
  var perfBounds=[17,25,34,50,100,250,1000];
  function perfRead(){
    var c=largestCanvas(),b=c?c.getBoundingClientRect():null;perfCanvas=c;
    var h=window.__GAME_HARNESS__,m=h&&h.metadata||{};
    var state=['playing','paused','menu','won','lost'].indexOf(m.state)>=0?m.state:'unknown';
    var backend=['canvas2d','webgl','webgl3d'].indexOf(m.gfxBackend)>=0?m.gfxBackend:undefined;
    return {viewportWidth:Math.round(innerWidth),viewportHeight:Math.round(innerHeight),
      canvasWidth:c?c.width:0,canvasHeight:c?c.height:0,
      canvasCssWidth:b?Math.round(b.width):0,canvasCssHeight:b?Math.round(b.height):0,
      dpr:devicePixelRatio||1,orientation:innerWidth>=innerHeight?'landscape':'portrait',
      state:state,gfxBackend:backend};
  }
  function perfCounter(){
    var h=window.__GAME_HARNESS__;
    return h&&typeof h.frame==='number'&&isFinite(h.frame)?h.frame:null;
  }
  function perfInvalidate(){perfDirty=true;perfPrevious=null;}
  addEventListener('visibilitychange',perfInvalidate);
  addEventListener('resize',perfInvalidate);
  addEventListener('message',function(e){
    var m=e.data||{};
    if(e.source!==parent||m.source!=='gdpl-host'||m.type!=='telemetry')return;
    if(perfActive!==!!m.active){perfActive=!!m.active;perfInvalidate();}
  });
  function perfTick(now){
    frames++;
    var h=window.__GAME_HARNESS__,m=h&&h.metadata||{},state=m.state||'unknown';
    if(perfState!==null&&state!==perfState)perfInvalidate();
    perfState=state;
    if(perfCanvas&&perfContext){
      if(perfCanvas.width!==perfWidth||perfCanvas.height!==perfHeight||
        (devicePixelRatio||1)!==perfDpr)perfInvalidate();
    }
    if(!perfActive||paused||document.visibilityState==='hidden')perfInvalidate();
    if(perfPrevious!==null){
      var gap=Math.max(0,now-perfPrevious),bin=0;
      while(bin<perfBounds.length&&gap>perfBounds[bin])bin++;
      perfBins[bin]++;perfMax=Math.max(perfMax,gap);
    }
    perfPrevious=now;
    requestAnimationFrame(perfTick);
  }
  if(_raf)requestAnimationFrame(perfTick);
  _si(function(){
    var now=performance.now(),counter=perfCounter(),context=perfRead();
    if(perfContext!==null&&JSON.stringify(context)!==perfContext)perfInvalidate();
    var sample=Object.assign({version:1,source:'raf',valid:!perfDirty&&perfActive&&!paused&&
      document.visibilityState!=='hidden',elapsedMs:Math.max(1,now-perfStart),
      intervals:perfBins,maxGapMs:perfMax},context);
    if(counter!==null&&perfRendered!==null&&counter>=perfRendered)sample.renderedFrames=counter-perfRendered;
    lastAlive=frames;post({type:'alive',frames:frames,performance:sample});frames=0;
    perfStart=now;perfBins=[0,0,0,0,0,0,0,0];perfMax=0;perfRendered=counter;
    perfDirty=!perfActive||paused||document.visibilityState==='hidden';
    perfContext=JSON.stringify(context);
    perfWidth=context.canvasWidth;perfHeight=context.canvasHeight;perfDpr=context.dpr;
  },5000);
`;
