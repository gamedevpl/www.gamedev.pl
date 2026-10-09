export const PLAY_PRESENCE_SCRIPT = String.raw`
let presenceController, presencePaused=false;
async function holdPresence() {
  if (presenceController || presencePaused) return;
  const controller = new AbortController();
  presenceController = controller;
  try {
    const response = await fetch(presencePath, {headers:presenceHeaders,signal:controller.signal,cache:'no-store'});
    if (!response.ok || !response.body) return;
    const reader = response.body.getReader();
    try { while (!(await reader.read()).done) {} }
    finally { await reader.cancel(); }
  } catch {} finally {
    if (presenceController===controller) presenceController=undefined;
    if (!presencePaused) setTimeout(holdPresence,1000);
  }
}
addEventListener('pagehide',()=>{presencePaused=true;presenceController?.abort();});
addEventListener('pageshow',()=>{presencePaused=false;void holdPresence();});
void holdPresence();
`;
