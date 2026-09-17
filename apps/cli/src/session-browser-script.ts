import { WORKBENCH_ONBOARDING_SCRIPT } from './workbench-onboarding-script.js';
import { WORKBENCH_PLAYER_SCRIPT } from './workbench-player-script.js';
import { WORKBENCH_NAVIGATION_SCRIPT } from './workbench-navigation-script.js';
import { WORKBENCH_TOOLS_SCRIPT } from './workbench-tools-script.js';
export const SESSION_BROWSER_SCRIPT = String.raw`
const el = id => document.getElementById(id);
const panel = el('panel'), draft = el('prompt');
let frame=el('game');
let token = location.hash.slice(1) || sessionStorage.getItem('session-token') || '';
if (/^[a-f0-9]{64}$/.test(token)) sessionStorage.setItem('session-token', token);
history.replaceState(null, '', '/');
let state, online = false, pending, sending = false, stopping = -1;
try {draft.value=sessionStorage.getItem('play-draft')||'';const saved=sessionStorage.getItem('play-pending');if(saved&&saved.length<20000)pending=JSON.parse(saved);}catch{}
draft.addEventListener('input',()=>sessionStorage.setItem('play-draft',draft.value));
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
  el('run-operation').disabled = !online || state?.mode !== 'prompt' || !!state?.question || !!pending || sending;
  const ready = online && state && !pending && !sending;
  el('send').disabled = !ready || state.mode === 'pick' || (state.mode === 'busy' && !state.localTask);
  el('send').textContent = state?.mode === 'busy' ? 'Queue request' : 'Send';
  el('stop').disabled = !online || !state?.localTask || state.mode !== 'busy' || stopping === state.taskId || Boolean(pending);
  draft.disabled = state?.mode === 'pick';
  for (const button of el('choices').children) button.disabled = !ready;
  el('retry').hidden = !pending || sending;
}
function reconcilePending(sessionId) {
  if(pending&&pending.envelope.sessionId!==sessionId) {
    pending=undefined;sessionStorage.removeItem('play-pending');
    el('feedback').textContent='Session changed. The previous request was not resent. Your draft and staged attachments are preserved; check the previous outcome before sending again.';
  }
}
function render(next) {
  reconcilePending(next.sessionId);
  const old = state;
  state = next;
  el('session-lifetime').textContent=state.detached?'This session runs independently. Use Commands → End session to stop it.':'Shared with your terminal. Keep the terminal session open.';
  updateWorkspace(next);
  const fingerprint=JSON.stringify([next.addresses,next.phone,next.reports]);if(fingerprint!==deviceFingerprint){deviceFingerprint=fingerprint;devices(next);}
  if (stopping >= 0 && state.taskId !== stopping) { stopping = -1; el('feedback').textContent = 'The stopped task is no longer active.'; }
  el('connection').textContent = state.localTask ? state.localTask + ' · ' + state.activity : state.mode === 'busy' ? state.activity : 'Connected · ready';
  el('identity').textContent = state.identity;
  el('game-name').textContent = state.identity || 'gamedev.pl';
  el('destination').textContent = state.question || state.choices.length ? 'Answering the current question' : state.mode === 'busy' && state.localTask ? 'Queue → session assistant after ' + state.localTask : 'To: session assistant · builder chosen before execution';
  window.dispatchEvent(new CustomEvent('play-session', {detail: {lines: state.lines,workspace:state.workspace}}));
  const transcript = el('transcript');
  const bottom = transcript.scrollTop + transcript.clientHeight >= transcript.scrollHeight - 30;
  const text = state.lines.join('\n');
  if (transcript.textContent !== text) { transcript.textContent = text; if (bottom) transcript.scrollTop = transcript.scrollHeight; }
  el('task').textContent = (state.mode === 'busy' ? [state.activity, ...state.live] : []).filter(Boolean).join('\n');
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
    sourceId = state.sourceId; revision = ''; candidate = '';lastSwapError='';
    swapEpoch++;frame.removeAttribute('srcdoc'); el('empty').hidden = false; el('apply').hidden = true;
  }
  controls();
  updateOnboarding(next);
}
async function deliver() {
  if (!pending || sending) return;
  const attempt = pending;
  sending = true; controls();
  try {
    const result = await api('/commands', attempt.envelope);
    if(pending!==attempt)return;
    if (result.status === 'accepted') {
      if (pending.envelope.command.kind === 'stop') { stopping = pending.envelope.command.taskId; el('feedback').textContent = 'Stop requested. Waiting for the task to exit.'; }
      else { if (pending.clearDraft && draft.value === pending.text) {draft.value = '';sessionStorage.removeItem('play-draft');tray();} el('feedback').textContent = pending.envelope.command.kind === 'queue' ? 'Queued after the current task.' : 'Request accepted. Staged attachments stay available until removed.'; }
    } else el('feedback').textContent = result.status === 'stale' ? 'The task or question changed. Review the current state and send again.' : 'Request refused: ' + result.status + '. Your draft is preserved.';
    pending = undefined;sessionStorage.removeItem('play-pending');
  } catch {
    if(pending!==attempt)return;
    online = false;
    el('feedback').textContent = 'No receipt received. Retry keeps the same request ID and cannot enqueue twice.';
  } finally { sending = false; controls(); }
}
function send(command, clearActionDraft=false) {
  if (!online || !state || pending || sending) return;
  pending = {envelope: {version:1, sessionId:state.sessionId, command:{...command, ...((command.kind==='input'&&!state.question&&!state.choices.length&&state.mode!=='pick'||command.kind==='queue')&&attachments.length?{attachments:attachments.map(a=>a.id)}:{}), id:crypto.randomUUID()}}, text:draft.value, attachmentIds:attachments.map(a=>a.id), clearDraft:state.mode !== 'pick'&&(command.kind!=='action'||clearActionDraft)};
  sessionStorage.setItem('play-pending',JSON.stringify(pending));void deliver();
}
el('composer').onsubmit = event => {
  event.preventDefault(); if (!draft.value.trim() || !state || el('send').disabled) return;
  if (!state.question && !state.choices.length && draft.value.trimStart().startsWith('/')) { submitSlash(); return; }
  send(state.mode === 'busy' ? {kind:'queue', taskId:state.taskId, text:draft.value} : {kind:'input', promptId:state.promptId, text:draft.value});
};
el('stop').onclick = () => send({kind:'stop', taskId:state.taskId});
el('retry').onclick = deliver;
el('edit').onclick = () => openChat();
el('close').onclick = () => closeChat();
el('fullscreen').onclick = () => { const request = document.fullscreenElement ? document.exitFullscreen() : document.documentElement.requestFullscreen(); request.catch(() => { el('notice').textContent = 'Fullscreen is unavailable in this browser.'; }); };
function viewport() { document.documentElement.style.setProperty('--height', (window.visualViewport?.height || window.innerHeight) + 'px'); }
window.visualViewport?.addEventListener('resize', viewport); viewport();
async function apply(force=false,automatic=false) {
  if (loading) return;
  loading = true; el('apply').disabled = true;
  const expectedSource = sourceId;
  try {
    const build = await api('/preview/game', undefined, 50000);
    if (build.sourceId !== expectedSource || sourceId !== expectedSource) return;
    await swapBuild(build,force,automatic);
  } catch { el('notice').textContent = 'Could not load the update. The previous game remains available.'; }
  finally { loading = false; el('apply').disabled = false; }
}
el('apply').onclick = () => apply();
let lastAuto='';
async function previewTick() {
  try {
    if (online && state?.hasPreview && !loading) {
      const build = await api('/preview/status');
      if (build.sourceId === sourceId) {
        el('notice').textContent = build.error || (build.busy || build.stale ? 'Building update…' : lastSwapError);
        if (!build.busy && !build.stale && build.revision) {
          candidate = build.revision;
          if (!revision) await apply();
          else {el('apply').hidden=candidate===revision||el('policy').value==='freeze';if(candidate!==revision&&el('policy').value==='auto'&&lastAuto!==candidate){const caps=await gameRequest(frame,'capabilities').catch(()=>null);if(caps?.validate&&caps.safe){lastAuto=candidate;await apply(false,true);}else el('notice').textContent='Update ready · waiting for a supported safe point, or apply manually.';}}
        }
      }
    }
  } catch { el('notice').textContent = 'Preview disconnected. The displayed game is unchanged.'; }
  setTimeout(previewTick, 1000);
}
async function tick() {
  try { const next = await api('/state'); online = true; render(next); }
  catch (error) { online = false; showConnectionError(error); controls(); }
  setTimeout(tick, 1000);
}
${WORKBENCH_PLAYER_SCRIPT}
${WORKBENCH_TOOLS_SCRIPT}
${WORKBENCH_NAVIGATION_SCRIPT}
${WORKBENCH_ONBOARDING_SCRIPT}
tick(); previewTick();
`;
