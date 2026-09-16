export const SESSION_BROWSER_SCRIPT = String.raw`
const el = id => document.getElementById(id);
const panel = el('panel'), frame = el('game'), draft = el('prompt');
let token = location.hash.slice(1) || sessionStorage.getItem('session-token') || '';
if (/^[a-f0-9]{64}$/.test(token)) sessionStorage.setItem('session-token', token);
history.replaceState(null, '', '/');
let state, online = false, pending, sending = false, stopping = -1;
let sourceId = -1, revision = '', candidate = '', loading = false;
async function api(path, data, timeout = 6000) {
  const response = await fetch(path, {
    method: data ? 'POST' : 'GET', cache: 'no-store',
    headers: {Authorization: 'Bearer ' + token, ...(data ? {'Content-Type': 'application/json'} : {})},
    ...(data ? {body: JSON.stringify(data)} : {}), signal: AbortSignal.timeout(timeout)
  });
  if (!response.ok) throw new Error('Session unavailable (' + response.status + ')');
  return response.json();
}
function controls() {
  const ready = online && state && !pending;
  el('send').disabled = !ready || state.mode === 'pick' || (state.mode === 'busy' && !state.localTask);
  el('send').textContent = state?.mode === 'busy' ? 'Queue request' : 'Send';
  el('stop').disabled = !online || !state?.localTask || state.mode !== 'busy' || stopping === state.taskId || Boolean(pending);
  draft.disabled = !ready || state.mode === 'pick';
  for (const button of el('choices').children) button.disabled = !ready;
  el('retry').hidden = !pending || sending;
}
function render(next) {
  const old = state;
  state = next;
  if (stopping >= 0 && state.taskId !== stopping) { stopping = -1; el('feedback').textContent = 'The stopped task is no longer active.'; }
  el('connection').textContent = state.localTask ? state.localTask + ' · ' + state.activity : state.mode === 'busy' ? state.activity : 'Connected · ready';
  el('identity').textContent = state.identity;
  const transcript = el('transcript');
  const bottom = transcript.scrollTop + transcript.clientHeight >= transcript.scrollHeight - 30;
  const text = state.lines.join('\n');
  if (transcript.textContent !== text) { transcript.textContent = text; if (bottom) transcript.scrollTop = transcript.scrollHeight; }
  el('task').textContent = [state.mode === 'busy' ? state.activity : '', ...state.live].filter(Boolean).join('\n');
  el('queue').textContent = state.queued.length ? 'Queued (' + state.queued.length + ')\n' + state.queued.map((v, i) => (i + 1) + '. ' + v).join('\n') : '';
  el('question').textContent = state.question;
  for (const id of ['prompt-label', 'prompt', 'actions']) el(id).hidden = state.mode === 'pick';
  if (!old || old.promptId !== state.promptId || old.mode !== state.mode) {
    el('choices').replaceChildren();
    el('composer').scrollTop = 0;
    for (const choice of state.choices) {
      const button = document.createElement('button'); button.type = 'button'; button.textContent = choice.label;
      const promptId = state.promptId;
      button.onclick = () => send({kind:'input', promptId, text:choice.value}); el('choices').append(button);
    }
  }
  if (sourceId !== state.sourceId) {
    sourceId = state.sourceId; revision = ''; candidate = '';
    frame.removeAttribute('srcdoc'); el('empty').hidden = false; el('apply').hidden = true;
  }
  controls();
}
async function deliver() {
  if (!pending || sending) return;
  sending = true; controls();
  try {
    const result = await api('/commands', pending.envelope);
    if (result.status === 'accepted') {
      if (pending.envelope.command.kind === 'stop') { stopping = pending.envelope.command.taskId; el('feedback').textContent = 'Stop requested. Waiting for the task to exit.'; }
      else { if (pending.clearDraft && draft.value === pending.text) draft.value = ''; el('feedback').textContent = pending.envelope.command.kind === 'queue' ? 'Queued after the current task.' : 'Request accepted.'; }
    } else el('feedback').textContent = result.status === 'stale' ? 'The task or question changed. Review the current state and send again.' : 'Request refused: ' + result.status + '. Your draft is preserved.';
    pending = undefined;
  } catch {
    online = false;
    el('feedback').textContent = 'No receipt received. Retry keeps the same request ID and cannot enqueue twice.';
  } finally { sending = false; controls(); }
}
function send(command) {
  if (!online || !state || pending) return;
  pending = {envelope: {version:1, sessionId:state.sessionId, command:{...command, id:crypto.randomUUID()}}, text:draft.value, clearDraft:state.mode !== 'pick'};
  void deliver();
}
el('composer').onsubmit = event => {
  event.preventDefault(); if (!draft.value.trim() || !state || el('send').disabled) return;
  send(state.mode === 'busy' ? {kind:'queue', taskId:state.taskId, text:draft.value} : {kind:'input', promptId:state.promptId, text:draft.value});
};
el('stop').onclick = () => send({kind:'stop', taskId:state.taskId});
el('retry').onclick = deliver;
el('edit').onclick = () => { document.exitPointerLock?.(); panel.showModal(); draft.focus(); };
el('close').onclick = () => panel.close();
panel.addEventListener('close', () => frame.focus());
el('fullscreen').onclick = () => { const request = document.fullscreenElement ? document.exitFullscreen() : document.documentElement.requestFullscreen(); request.catch(() => { el('notice').textContent = 'Fullscreen is unavailable in this browser.'; }); };
function viewport() { document.documentElement.style.setProperty('--height', (window.visualViewport?.height || window.innerHeight) + 'px'); }
window.visualViewport?.addEventListener('resize', viewport); viewport();
async function apply() {
  if (loading) return;
  loading = true; el('apply').disabled = true;
  const expectedSource = sourceId;
  try {
    const build = await api('/preview/game', undefined, 50000);
    if (build.sourceId !== expectedSource || sourceId !== expectedSource) return;
    frame.srcdoc = build.html; revision = build.revision;
    el('empty').hidden = true; el('apply').hidden = true; el('notice').textContent = '';
  } catch { el('notice').textContent = 'Could not load the update. The previous game remains available.'; }
  finally { loading = false; el('apply').disabled = false; }
}
el('apply').onclick = apply;
async function previewTick() {
  try {
    if (online && state?.hasPreview && !loading) {
      const build = await api('/preview/status');
      if (build.sourceId === sourceId) {
        el('notice').textContent = build.error || (build.busy || build.stale ? 'Building update…' : '');
        if (!build.busy && !build.stale && build.revision) {
          candidate = build.revision;
          if (!revision) await apply();
          else el('apply').hidden = candidate === revision;
        }
      }
    }
  } catch { el('notice').textContent = 'Preview disconnected. The displayed game is unchanged.'; }
  setTimeout(previewTick, 1000);
}
async function tick() {
  try { const next = await api('/state'); online = true; render(next); }
  catch { online = false; el('connection').textContent = 'Disconnected · keep the terminal open'; el('task').textContent = 'Disconnected. Reopen /play from your terminal session.'; controls(); }
  setTimeout(tick, 1000);
}
tick(); previewTick();
`;
