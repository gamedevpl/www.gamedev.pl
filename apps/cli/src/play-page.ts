export const PLAY_PAGE = String.raw`<!doctype html>
<html>
<head>
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>gamedevpl play</title>
<style>
html,body{margin:0;height:100%;background:#12151c;color:#eee;font:14px system-ui}
body{display:flex;flex-direction:column}
header{padding:10px 16px}
button{margin-left:12px}
pre{white-space:pre-wrap;max-height:25vh;overflow:auto;color:#ffd398;margin:0 16px}
iframe{width:100%;flex:1;border:0;min-height:0;background:#000}
</style>
</head>
<body>
<header>gamedevpl · Live preview <button id="pause">Pause reload</button><span id="status" role="status"></span></header>
<pre id="error"></pre>
<iframe title="Game preview" sandbox="allow-scripts allow-pointer-lock"></iframe>
<script>
let revision = '', paused = false;
const frame = document.querySelector('iframe');
const status = document.querySelector('#status');
document.querySelector('#pause').onclick = event => {
  paused = !paused;
  event.target.textContent = paused ? 'Resume reload' : 'Pause reload';
};
async function tick() {
  try {
    const state = await fetch(location.pathname + 'status', {cache:'no-store'}).then(r => r.json());
    document.querySelector('#error').textContent = state.error;
    status.textContent = state.busy ? ' · rebuilding…' : paused ? ' · paused' : ' · watching files';
    if (!paused && state.revision && state.revision !== revision) {
      const html = await fetch(location.pathname + 'game', {cache:'no-store'}).then(r => r.text());
      frame.srcdoc = html;
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
