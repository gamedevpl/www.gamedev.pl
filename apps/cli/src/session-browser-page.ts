import { SESSION_BROWSER_SCRIPT } from './session-browser-script.js';

export const SESSION_BROWSER_PAGE = String.raw`<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
<title>gamedevpl · Play & edit</title><style>
:root{color-scheme:dark;font:14px system-ui,sans-serif;color:#e8edf5;background:#080c12;--height:100dvh}
*{box-sizing:border-box}[hidden]{display:none!important}html,body{margin:0;width:100%;height:100%;overflow:hidden}
button,textarea,select,input{font:inherit}select{max-width:100%;background:#202b3b;color:inherit;padding:8px}#workbench-tools{min-height:40px;flex:0 1 auto;padding:12px;max-height:40%;overflow:auto}#workbench-tools label{display:block;margin:8px 0}#workbench-tools .actions{flex-wrap:wrap}button{border:1px solid #394759;background:#202b3b;color:inherit;padding:10px 14px;border-radius:10px;cursor:pointer}
button:hover{background:#304057}button:disabled{opacity:.45;cursor:default}button:focus-visible,textarea:focus-visible{outline:2px solid #56ecc1;outline-offset:3px}
.primary{background:#65edc7;color:#09241d;border-color:transparent;font-weight:700}.primary:hover{background:#9bf8dc}
#game{position:fixed;inset:0;width:100%;height:100%;border:0;background:#080c12}
#empty{position:fixed;inset:0;display:grid;place-content:center;text-align:center;padding:24px;pointer-events:none;color:#9cacc0}
#empty[hidden]{display:none}#empty h1{color:#e8edf5;font-size:28px;margin:0 0 12px}
#tools{position:fixed;top:max(14px,env(safe-area-inset-top));left:max(14px,env(safe-area-inset-left));right:max(14px,env(safe-area-inset-right));display:flex;gap:8px;align-items:center;flex-wrap:wrap;pointer-events:none}
#tools>*{pointer-events:auto;box-shadow:0 8px 24px #0005}#connection{padding:10px 14px;border:1px solid #344152;border-radius:10px;background:#111925ed;max-width:min(70vw,500px);overflow-wrap:anywhere}
#edit{margin-left:auto}#notice{position:fixed;bottom:max(16px,env(safe-area-inset-bottom));left:16px;max-width:calc(100% - 32px);padding:12px;background:#24201bf2;color:#ffdbab;border:1px solid #655039;border-radius:10px;white-space:pre-wrap;max-height:25vh;overflow:auto}#notice:empty{display:none}
dialog{color:inherit;background:#111923f5;border:1px solid #344252;border-radius:18px;margin:12px 12px 12px auto;padding:0;width:min(430px,calc(100vw - 24px));height:calc(var(--height) - 24px);max-height:calc(var(--height) - 24px);box-shadow:0 18px 80px #0008}
dialog::backdrop{background:#0003}dialog[open]{display:flex;flex-direction:column}
.panel-head{display:flex;gap:12px;align-items:center;padding:16px;border-bottom:1px solid #2b3747}.panel-head strong{font-size:17px;flex:1}.panel-head button{padding:6px 10px}
#identity{font-size:12px;color:#9cacc0;overflow-wrap:anywhere;margin:0;padding:12px 16px 0}
#transcript{white-space:pre-wrap;overflow-wrap:anywhere;overflow:auto;flex:1;min-height:40px;margin:0;padding:16px;font:13px/1.65 ui-monospace,monospace}
#task{padding:10px 16px;color:#98e7cf;font-size:12px;white-space:pre-wrap;max-height:15%;overflow:auto}
#queue{padding:0 16px 8px;font-size:12px;color:#abb8c9;max-height:15%;overflow:auto;white-space:pre-wrap}
#composer{flex:0 0 auto;min-height:0;max-height:65%;overflow:auto;border-top:1px solid #2b3747;padding:14px;display:grid;gap:10px}
#question:empty,#feedback:empty,#task:empty,#queue:empty{display:none}#question{margin:0;overflow-wrap:anywhere;max-height:16vh;overflow:auto}#choices{display:grid;gap:6px;max-height:22vh;overflow:auto}#choices:empty{display:none}
textarea{resize:vertical;min-height:72px;max-height:20vh;width:100%;color:inherit;background:#0a111b;border:1px solid #3a4c60;border-radius:10px;padding:12px}
.actions{display:flex;gap:8px}.actions #send{flex:1}#feedback{margin:0;font-size:12px;color:#ffd6a0;overflow-wrap:anywhere}
.hint{font-size:11px;color:#8d9caf;margin:0;line-height:1.5}#retry[hidden]{display:none}
@media(max-height:520px){#composer>.hint{display:none}#composer{padding:10px;gap:6px}#transcript{min-height:20px}}
@media(max-width:520px){#connection{font-size:12px;max-width:calc(100vw - 145px)}#tools{gap:6px}#tools button{padding:9px 10px}.panel-head{padding:12px}#transcript{padding:12px}}
</style></head><body>
<iframe id="game" title="Game preview" sandbox="allow-scripts allow-pointer-lock"></iframe>
<div id="empty"><h1>Your game, your workspace.</h1><p>Describe your game in the editor, or open a local game from Tools.</p></div>
<nav id="tools" aria-label="Play controls"><span id="connection" role="status">Connecting…</span><button id="apply" hidden>Apply update · preserve state</button><span id="shown-build"></span><select id="policy" aria-label="Update policy"><option value="ask">Ask before update</option><option value="auto">Auto · preserve state</option><option value="freeze">Freeze build</option></select><button id="restart" hidden>Restart with update</button><button id="clean">Clean play</button><button id="fullscreen">Fullscreen</button><button id="edit" class="primary">Edit game</button></nav>
<button id="reveal" hidden aria-label="Show Play controls" style="position:fixed;top:12px;right:12px">Edit</button><pre id="notice" role="status"></pre>
<dialog id="panel" aria-labelledby="panel-title"><div class="panel-head"><strong id="panel-title">Edit game</strong><button id="close" aria-label="Close editing panel">Close</button></div>
<p id="identity"></p><pre id="transcript" tabindex="0" aria-label="Conversation output"></pre><div id="task"></div><div id="queue"></div>
<details id="workbench-tools"><summary>Tools, attachments &amp; devices</summary>
<label>Operation <select id="operation"></select></label><input id="operation-argument" placeholder="Game slug or handle (when required)" aria-label="Operation argument"><button id="run-operation" type="button">Run</button>
<label>Upload purpose <select id="purpose"><option value="reference">Reference</option><option value="asset">Game asset</option></select></label>
<label>Attach file <input id="upload" type="file" multiple accept="image/png,image/jpeg,image/webp,video/webm,video/mp4,application/json,text/plain"></label>
<div class="actions"><button id="screenshot">Screenshot</button><button id="trace">Trace</button></div>
<div class="actions"><button id="record">Enable recording</button><button id="clip">Attach recent clip</button></div>
<p class="hint">Attachments remain staged until you remove them, including during clarification. Media is stored locally. Local agents can inspect these files using their supported tools. Video and DOM overlays may not be supported by every agent.</p>
<div id="attachments"></div><div id="devices"></div></details>
<form id="composer"><p id="question"></p><div id="choices"></div><label id="prompt-label" for="prompt">Your request</label><textarea id="prompt" maxlength="8000" placeholder="Describe what to change…"></textarea>
<div id="actions" class="actions"><button id="send" class="primary" type="submit" disabled>Send</button><button id="stop" type="button" disabled>Stop task</button></div>
<p id="feedback" role="status"></p><button id="retry" type="button" hidden>Retry same request</button><p id="session-lifetime" class="hint">Shared with your terminal. Keep the terminal session open. Closing this tab does not stop the task.</p></form></dialog>
<script>${SESSION_BROWSER_SCRIPT}</script></body></html>`;
