import { PLAY_EMBED_SCRIPT } from './generated/play-ui.js';

export const PLAY_PAGE = String.raw`<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
<title>gamedevpl play</title>
<style>
html,body{margin:0;height:100%;overflow:hidden;background:#000;color:#eee;font:14px system-ui}
iframe{position:fixed;inset:0;width:100%;height:100%;border:0;background:#000}
details{position:fixed;top:max(12px,env(safe-area-inset-top));right:max(12px,env(safe-area-inset-right));z-index:1;max-width:calc(100% - 24px);background:#12151ce6;border-radius:12px;padding:10px}
summary,button{cursor:pointer}
button{font:inherit;color:inherit;background:#252b37;border:1px solid #536075;border-radius:8px;padding:8px;margin-top:8px}
#controls{white-space:pre-wrap;max-height:30dvh;overflow:auto}
pre{position:fixed;bottom:max(12px,env(safe-area-inset-bottom));left:12px;right:12px;z-index:1;white-space:pre-wrap;max-height:25dvh;overflow:auto;color:#ffd398;background:#12151ce6;border-radius:12px;padding:12px;margin:0}
[hidden]{display:none!important}
</style>
</head>
<body>
<iframe title="Game preview" sandbox="allow-scripts allow-pointer-lock"></iframe>
<details><summary>Preview controls</summary><button id="pause">Pause reload</button> <button id="sound">Sound: On</button><div id="controls"></div><div id="status" role="status"></div></details>
<pre id="error" role="status" hidden></pre>
<script>
${PLAY_EMBED_SCRIPT}
let revision = '', paused = false, muted = false;
const frame = document.querySelector('iframe');
const status = document.querySelector('#status');
const errorBox = document.querySelector('#error');
const sound = document.querySelector('#sound');
function posture(type,data={}) { frame.contentWindow?.postMessage({source:'gdpl-host',type,...data},'*'); }
frame.onload=()=>{posture('hello');posture('setSound',{muted});};
sound.onclick=()=>{muted=!muted;posture('setSound',{muted});sound.textContent=muted?'Sound: Off':'Sound: On';};
addEventListener('message',event=>{
  const data=event.data;
  if(event.source!==frame.contentWindow||data?.source!=='gdpl-player')return;
  if(data.type==='controls'&&Array.isArray(data.rows))document.querySelector('#controls').textContent=data.rows.slice(0,30).map(row=>[row?.keys,row?.action].filter(value=>typeof value==='string').map(value=>value.slice(0,200)).join(' · ')).join('\n');
});
document.querySelector('#pause').onclick = event => {
  paused = !paused;
  event.target.textContent = paused ? 'Resume reload' : 'Pause reload';
};
async function tick() {
  try {
    const state = await fetch(location.pathname + 'status', {cache:'no-store'}).then(r => r.json());
    errorBox.textContent = state.error;
    errorBox.hidden = !state.error;
    status.textContent = state.busy ? ' · rebuilding…' : paused ? ' · paused' : ' · watching files';
    if (!paused && state.revision && state.revision !== revision) {
      const html = await fetch(location.pathname + 'game', {cache:'no-store'}).then(r => r.text());
      frame.srcdoc = GAME_EMBED.embedGameHtml(html);
      revision = state.revision;
    }
  } catch {
    status.textContent = ' · preview disconnected';
  }
  setTimeout(tick, 750);
}
tick();
</script>
</body>
</html>`;
