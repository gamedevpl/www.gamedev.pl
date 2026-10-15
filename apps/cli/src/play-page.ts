import { PREVIEW_SCRIPT, PREVIEW_STYLE } from './generated/play-ui.js';
import { MASCOT_FAVICON_DATA_URL, MASCOT_SVG } from './mascot-svg.js';
import { PLAY_PRESENCE_SCRIPT } from './play-presence-script.js';

export const PLAY_PAGE = String.raw`<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
<title>gamedevpl play</title>
<link rel="icon" type="image/svg+xml" href="${MASCOT_FAVICON_DATA_URL}">
<style>${PREVIEW_STYLE}</style>
</head>
<body data-state="preparing">
<iframe title="Game preview" sandbox="allow-scripts allow-pointer-lock"></iframe>
<div id="loading" class="preview-loading" role="status">
${MASCOT_SVG}
<h1 id="loading-title">Preparing your game</h1>
<p id="loading-message">The first build is on its way. Your game will appear here automatically.</p>
</div>
<details class="preview-tools">
<summary aria-label="Preview settings" title="Preview settings"><span class="preview-indicator" aria-hidden="true"></span><span>Preview</span><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true"><path d="m9 5 7 7-7 7"/></svg></summary>
<div class="preview-panel">
<h2>Local preview</h2>
<p id="status" role="status">Preparing your game…</p>
<button id="pause" type="button" aria-pressed="false"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true"><path d="M8 5v14M16 5v14"/></svg><span id="pause-label">Pause live reload</span></button>
<button id="sound" type="button" aria-pressed="false"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true"><path d="m11 5-6 4H2v6h3l6 4V5ZM15 8a6 6 0 0 1 0 8m3-11a10 10 0 0 1 0 14"/></svg><span id="sound-label">Sound on</span></button>
<div id="controls"></div>
</div>
</details>
<pre id="error" role="status" hidden></pre>
<script id="preview-bootstrap" type="application/json">null</script>
<script>${PREVIEW_SCRIPT}</script>
<script>
const presencePath=location.pathname+'presence',presenceProtocols=[];
${PLAY_PRESENCE_SCRIPT}
</script>
</body>
</html>`;

export function renderPlayPage(state: { revision: string; html: string; error: string; busy: boolean }): string {
  const data = JSON.stringify(state).replace(/</g, '\\u003c');
  return PLAY_PAGE.replace('type="application/json">null</script>', () => `type="application/json">${data}</script>`);
}
