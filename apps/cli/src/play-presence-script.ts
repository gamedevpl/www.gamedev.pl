export const PLAY_PRESENCE_SCRIPT = String.raw`
let presenceSocket, presencePaused=false, presenceRetry;
function holdPresence() {
  if (presenceSocket || presencePaused) return;
  const url=new URL(presencePath,location.href);url.protocol=location.protocol==='https:'?'wss:':'ws:';
  try {
    const socket=new WebSocket(url,presenceProtocols);
    presenceSocket=socket;
    socket.onerror=()=>socket.close();
    socket.onclose=()=>{
      if(presenceSocket===socket)presenceSocket=undefined;
      if(!presencePaused)presenceRetry=setTimeout(holdPresence,1000);
    };
  } catch {if(!presencePaused)presenceRetry=setTimeout(holdPresence,1000);}
}
addEventListener('pagehide',()=>{presencePaused=true;clearTimeout(presenceRetry);presenceSocket?.close();});
addEventListener('pageshow',()=>{presencePaused=false;holdPresence();});
holdPresence();
`;
