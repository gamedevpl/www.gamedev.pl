import { embedGameHtml } from '../../../packages/contract/src/game-embed.js';
import { startGamepadBridge } from './gamepad-bridge.js';
import './preview.css';

interface PreviewState {
  revision: string;
  error: string;
  busy?: boolean;
  html?: string;
}

const frame = document.querySelector('iframe')!;
const menu = document.querySelector('details')!;
const status = document.getElementById('status')!;
const errorBox = document.getElementById('error')!;
const loading = document.getElementById('loading')!;
const loadingTitle = document.getElementById('loading-title')!;
const loadingMessage = document.getElementById('loading-message')!;
const pause = document.getElementById('pause')!;
const pauseLabel = document.getElementById('pause-label')!;
const sound = document.getElementById('sound')!;
const soundLabel = document.getElementById('sound-label')!;
let revision = '',
  paused = false,
  muted = false;

function posture(type: string, data = {}) {
  frame.contentWindow?.postMessage({ source: 'gdpl-host', type, ...data }, '*');
}

frame.onload = () => {
  posture('hello');
  posture('setSound', { muted });
};
sound.onclick = () => {
  muted = !muted;
  posture('setSound', { muted });
  sound.setAttribute('aria-pressed', String(muted));
  soundLabel.textContent = muted ? 'Sound off' : 'Sound on';
};
pause.onclick = () => {
  paused = !paused;
  pause.setAttribute('aria-pressed', String(paused));
  pauseLabel.textContent = paused ? 'Resume live reload' : 'Pause live reload';
};

startGamepadBridge();

addEventListener('message', (event) => {
  const data = event.data;
  if (event.source !== frame.contentWindow || data?.source !== 'gdpl-player') return;
  if (data.type === 'controls' && Array.isArray(data.rows))
    document.getElementById('controls')!.textContent = data.rows
      .slice(0, 30)
      .map((row: { keys?: unknown; action?: unknown } | null) =>
        [row?.keys, row?.action]
          .filter((value): value is string => typeof value === 'string')
          .map((value) => value.slice(0, 200))
          .join(' · '),
      )
      .join('\n');
});

addEventListener('keydown', (event) => {
  if (event.key === 'Escape' && menu.open) {
    menu.open = false;
    menu.querySelector('summary')!.focus();
  }
});
addEventListener('pointerdown', (event) => {
  if (event.target instanceof Node && !menu.contains(event.target)) menu.open = false;
});
addEventListener('blur', () => {
  if (document.activeElement === frame) menu.open = false;
});

function showGame(html: string, nextRevision: string) {
  frame.srcdoc = embedGameHtml(html);
  revision = nextRevision;
  loading.hidden = true;
}

function showStatus(state: PreviewState) {
  errorBox.textContent = state.error;
  errorBox.hidden = !state.error;
  document.body.dataset.state = state.error
    ? 'error'
    : state.busy
      ? 'building'
      : paused
        ? 'paused'
        : revision
          ? 'ready'
          : 'preparing';
  status.textContent = paused
    ? 'Live reload paused'
    : state.error
      ? 'Build needs attention'
      : state.busy
        ? 'Updating preview…'
        : revision
          ? 'Watching for changes'
          : 'Preparing your game…';
  loadingTitle.textContent = state.error ? 'Your game needs a fix' : 'Preparing your game';
  loadingMessage.textContent = state.error
    ? 'Fix the build error below. Preview will update automatically.'
    : 'The first build is on its way. Your game will appear here automatically.';
}

const bootstrap = document.getElementById('preview-bootstrap')!;
const initial: PreviewState | null = JSON.parse(bootstrap.textContent || 'null');
bootstrap.remove();
if (initial?.revision && initial.html) showGame(initial.html, initial.revision);
if (initial) showStatus(initial);

async function tick() {
  try {
    const response = await fetch(location.pathname + 'status', { cache: 'no-store' });
    if (!response.ok) throw new Error('Preview unavailable');
    const state: PreviewState = await response.json();
    if (!paused && state.revision && state.revision !== revision) {
      const game = await fetch(location.pathname + 'game', { cache: 'no-store' });
      if (!game.ok) throw new Error('Game unavailable');
      showGame(await game.text(), state.revision);
    }
    showStatus(state);
  } catch {
    document.body.dataset.state = 'disconnected';
    status.textContent = 'Preview disconnected';
    loadingTitle.textContent = 'Waiting for preview';
    loadingMessage.textContent = 'Keep the development server running. Preview will reconnect automatically.';
  }
  setTimeout(tick, revision ? 750 : 200);
}
void tick();
