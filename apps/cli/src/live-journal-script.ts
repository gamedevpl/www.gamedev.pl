export const LIVE_JOURNAL_SCRIPT = String.raw`
const journalFrames=new Map();
addEventListener('message',event=>{
  const message=event.data;
  if(!message||message.source!=='gdpl-journal'||event.source!==frame.contentWindow||!revision)return;
  if(typeof hotUpdating!=='undefined'&&hotUpdating)return;
  if(typeof message.json!=='string'||message.json.length>256000)return;
  if(!liveSocket||liveSocket.readyState!==1||liveSocket.bufferedAmount>1000000)return;
  let entries;try{entries=JSON.parse(message.json);}catch{return;}
  if(!Array.isArray(entries)||!entries.length||entries.length>256)return;
  if(journalFrames.size>=256&&!journalFrames.has(message.recordingId))return;
  journalFrames.set(message.recordingId,event.source);
  liveHello();
  liveSend({type:'live:journal',recordingId:message.recordingId,startedAt:message.startedAt,entries,...(message.segment?{segment:message.segment}:{})});
});
addEventListener('play-presence-connected',event=>{
  event.detail.addEventListener('message',event=>{
    let message;try{message=JSON.parse(event.data);}catch{return;}
    if(message?.type!=='live:journal-ack')return;
    journalFrames.get(message.recordingId)?.postMessage({source:'gdpl-journal-host',...message},'*');
  });
});
`;
