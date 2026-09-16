// Runs inside the opaque game frame; messages never carry editor credentials.
export const WORKBENCH_GAME_BRIDGE = String.raw`
(() => {
  const events = []; let recorder, stream, clip, recording = false, timer;
  function trace(type, data) { events.push({time:performance.now(),type,...data}); if(events.length>500) events.shift(); }
  for(const type of ['keydown','keyup']) addEventListener(type,e=>trace(type,{key:e.key.slice(0,30),repeat:e.repeat}));
  for(const type of ['pointerdown','pointerup']) addEventListener(type,e=>trace(type,{x:e.clientX/innerWidth,y:e.clientY/innerHeight,button:e.button}));
  addEventListener('error',e=>trace('error',{message:String(e.message).slice(0,500)}));
  const canvas = () => [...document.querySelectorAll('canvas')].sort((a,b)=>b.width*b.height-a.width*a.height)[0];
  const harness = () => window.__GAME_HARNESS__;
  function halt() { recording=false; clearTimeout(timer); if(recorder?.state==='recording') recorder.stop(); stream?.getTracks().forEach(t=>t.stop()); stream=undefined; }
  function segment() {
    if(!recording) return;
    const chunks=[]; let bytes=0;
    recorder=new MediaRecorder(stream);
    recorder.ondataavailable=e=>{bytes+=e.data.size;if(bytes>12*1024*1024){halt();clip=undefined;}else chunks.push(e.data);};
    recorder.onstop=()=>{if(recording){clip=new Blob(chunks,{type:recorder.mimeType});segment();}};
    recorder.onerror=()=>halt(); recorder.start(1000);
    timer=setTimeout(()=>{if(recorder.state==='recording')recorder.stop();},8000);
  }
  addEventListener('pagehide',halt);
  addEventListener('message',async e=>{
    const m=e.data;
    if(e.source!==parent||!m||m.source!=='gdpl-workbench'||typeof m.id!=='string')return;
    let data, error;
    try {
      const h=harness();
      if(m.type==='capabilities') data={ready:h?!!h.ready:document.readyState==='complete',state:typeof h?.snapshotState==='function'&&typeof h?.restoreState==='function',validate:typeof h?.validateState==='function',safe:typeof h?.canHotReload==='function'&&h.canHotReload()===true,record:!!canvas()?.captureStream&&typeof MediaRecorder==='function'};
      else if(m.type==='snapshot') { data=h?.snapshotState?.(); if(JSON.stringify(data??null).length>1000000)throw Error('State too large'); }
      else if(m.type==='restore') { if(typeof h?.restoreState!=='function')throw Error('State restoration unsupported'); if(typeof h.validateState==='function'&&h.validateState(m.data)!==true)throw Error('State incompatible with this build'); data=h.restoreState(m.data)===true; }
      else if(m.type==='trace') data={format:'gamedevpl-diagnostics-v1',replayable:false,events:[...events],metadata:h?.metadata??null,viewport:{width:innerWidth,height:innerHeight,dpr:devicePixelRatio}};
      else if(m.type==='record') { if(!canvas()?.captureStream||typeof MediaRecorder!=='function')throw Error('Canvas recording unavailable'); if(!recording){clip=undefined;stream=canvas().captureStream(20);recording=true;segment();} data=true; }
      else if(m.type==='record-stop') {halt();data=true;}
      else if(m.type==='clip') { if(!clip)throw Error('No complete 8-second segment yet. Enable recording and play for at least 8 seconds.'); data={bytes:await clip.arrayBuffer(),mime:clip.type,surface:'largest canvas; no audio or DOM overlays',durationSeconds:8}; }
      else throw Error('Unknown game operation');
    } catch(e) {error=String(e.message||e).slice(0,300);}
    parent.postMessage({source:'gdpl-workbench-game',id:m.id,data,error},'*');
  });
})();`;
