import { PLAY_MARKUP, PLAY_CLIENT, PLAY_STYLE } from './generated/play-ui.js';
import { SESSION_BROWSER_SCRIPT } from './session-browser-script.js';

export const SESSION_BROWSER_PAGE = `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
<title>gamedevpl · Play</title><style>${PLAY_STYLE}</style></head><body>
<iframe id="game" title="Game preview" sandbox="allow-scripts allow-pointer-lock"></iframe>
<div id="empty"><h1 id="empty-title">Connecting to your workspace…</h1><p id="empty-description">Your game will appear here when the session is ready.</p></div>
<div id="workbench">${PLAY_MARKUP}</div>
<script>${PLAY_CLIENT}\n${SESSION_BROWSER_SCRIPT}</script></body></html>`;
