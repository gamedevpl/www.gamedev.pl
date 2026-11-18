import { PROMPT_MARKER } from 'genaicode/app-agent';
import { EVIDENCE_MARKER } from './workbench-evidence.js';
import { WORKBENCH_ONBOARDING_SCRIPT } from './workbench-onboarding-script.js';
import { WORKBENCH_PLAYER_SCRIPT } from './workbench-player-script.js';
import { WORKBENCH_NAVIGATION_SCRIPT } from './workbench-navigation-script.js';
import { WORKBENCH_TOOLS_SCRIPT } from './workbench-tools-script.js';
import { WORKBENCH_BUILD_ERROR_SCRIPT } from './workbench-build-error-script.js';
import { PLAY_PRESENCE_SCRIPT } from './play-presence-script.js';
import { LIVE_GAME_SCRIPT } from './live-game-script.js';
import { LIVE_JOURNAL_SCRIPT } from './live-journal-script.js';
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
  el('send').textContent = state?.mode === 'busy' ? (state.canSteer ? 'Send to agent' : 'Queue request') : 'Send';
  el('stop').disabled = !online || !state?.localTask || (state.mode !== 'busy' && !state.approvalPending) || stopping === state.taskId || Boolean(pending);
  draft.disabled = state?.mode === 'pick';
  for (const button of el('choices').children) button.disabled = !ready;
  el('retry').hidden = !pending || sending;
  buildErrorControls();
}
function reconcilePending(sessionId) {
  if(pending&&pending.envelope.sessionId!==sessionId) {
    pending=undefined;sessionStorage.removeItem('play-pending');
    el('feedback').textContent='Session changed. The previous request was not resent. Your draft and staged attachments are preserved; check the previous outcome before sending again.';
  }
}
const outgoing = new Map();
function agentMessageCount(agent, text, files) {
  const userMarker = ${JSON.stringify(PROMPT_MARKER)}, evidenceMarker = ${JSON.stringify(EVIDENCE_MARKER)};
  const matches = prompt => {
    const message = prompt.split(userMarker).at(-1);
    const [caption, evidence] = message.split(evidenceMarker);
    if (files.length) return (!text || caption.trim()===text) && files.every(id=>evidence?.includes('"id":'+JSON.stringify(id)));
    return !evidence && caption.trim()===text;
  };
  let count = 0;
  for (const turn of [...(agent?.history ?? []), ...(agent?.session?.turns ?? [])]) {
    if (matches(turn.prompt)) count++;
    for (const entry of turn.entries) if (entry.kind==='input' && matches(entry.text)) count++;
  }
  return count;
}
function publishConversation(follow=false) {
  for (const [id,item] of outgoing) {
    const mirrored = item.occurrence !== undefined && agentMessageCount(state.agent,item.text,item.files) >= item.occurrence;
    const awaitingTurn = item.occurrence !== undefined && state.agent && state.mode==='busy';
    const received = state.recentMessageIds?.includes(id) || state.sequence >= item.sequence;
    if (item.sessionId !== state.sessionId || mirrored || (received && !awaitingTurn)) outgoing.delete(id);
  }
  window.dispatchEvent(new CustomEvent('play-session', {detail: {follow,outgoing:[...outgoing.values()],lines: state.lines,diffs:state.diffs,readDiff:id=>api('/diff/'+id),workspace:state.workspace,agent:state.agent,deliveries:state.deliveries||[]}}));
}
function render(next) {
  reconcilePending(next.sessionId);
  const old = state;
  state = next;
  const actionQuestion = state.approvalPending && state.choices.length === 2 && state.choices[0].value === 'Approve' && state.choices[1].value === 'Reject' && state.agent?.actions?.some(action => action.status === 'pending' && action.summary === state.question);
  for (const id of ['question', 'choices']) el(id).hidden = Boolean(actionQuestion);
  el('session-lifetime').textContent=state.detached?'Play ends 60 seconds after its last tab closes, once active work finishes. Commands → End session stops it now.':'Keep the terminal session open. Ctrl+C ends Play.';
  const fingerprint=JSON.stringify([next.addresses,next.phone,next.reports]);if(fingerprint!==deviceFingerprint){deviceFingerprint=fingerprint;devices(next);}
  if (stopping >= 0 && state.taskId !== stopping) { stopping = -1; el('feedback').textContent = 'The stopped task is no longer active.'; }
  el('connection').textContent = state.localTask ? state.localTask + ' · ' + state.activity : state.mode === 'busy' ? state.activity : 'Connected · ready';
  el('identity').textContent = state.identity;
  el('game-name').textContent = state.identity || 'gamedev.pl';
  el('destination').textContent = actionQuestion ? 'Review the pending action above' : state.question || state.choices.length ? 'Answering the current question' : state.agent ? 'To: ' + state.agent.agent + ' · edits, checks and asks before delivery' : state.mode === 'busy' && state.localTask ? 'Queue → session assistant after ' + state.localTask : 'To: session assistant · builder chosen before execution';
  publishConversation();
  el('task').textContent = (state.mode === 'busy' || state.approvalPending ? [state.activity, ...state.live] : []).filter(Boolean).join('\n');
  el('task').dataset.tone = /^(?:blocked|failed|error)\b/i.test(state.activity) ? 'red' : '';
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
    liveRelease();
    sourceId = state.sourceId; revision = ''; candidate = '';lastSwapError='';replacingFrame=false;
    swapEpoch++;frame.removeAttribute('srcdoc'); el('empty').hidden = false; el('apply').hidden = true;
    failedBuild=undefined;el('notice').textContent='';updateBuildError();
  }
  updateWorkspace(next);
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
    const command = attempt.envelope.command;
    const echo = outgoing.get(command.id);
    if (result.status === 'accepted') {
      if(echo) echo.sequence = result.sequence;
      if (command.kind === 'stop') {
        stopping = command.taskId;
        el('feedback').textContent = 'Stop requested. Waiting for the task to exit.';
      } else {
        const sent = command.attachments ?? [];
        attachments = attachments.filter(item => !sent.includes(item.id));
        if (attempt.clearDraft && draft.value === attempt.text) {
          draft.value = '';
          sessionStorage.removeItem('play-draft');
        }
        tray();
        const withFiles = sent.length ? ' with ' + sent.length + (sent.length===1 ? ' attachment' : ' attachments') : '';
        const status = command.kind !== 'queue' ? 'Request accepted'
          : !attempt.steer ? 'Queued after the current task; stopping will discard it'
          : state?.agent ? 'Message submitted; see delivery status above' : 'Accepted by the agent';
        el('feedback').textContent = status + withFiles + '.';
      }
    } else {
      outgoing.delete(command.id);
      el('feedback').textContent = result.status === 'stale' ? 'The task or question changed. Review the current state and send again.' : 'Request refused: ' + result.status + '. Your draft is preserved.';
    }
    if(echo)publishConversation();
    pending = undefined;sessionStorage.removeItem('play-pending');
  } catch {
    if(pending!==attempt)return;
    online = false;
    el('feedback').textContent = 'No receipt received. Retry keeps the same request ID and cannot enqueue twice.';
  } finally { sending = false; controls(); }
}
function send(command, clearActionDraft=false) {
  if (!online || !state || pending || sending) return;
  liveHello();liveSend({type:'live:select'});
  const message = command.kind==='queue' || (command.kind==='input' && !state.question && !state.choices.length && state.mode!=='pick');
  const id = crypto.randomUUID();
  const files = message ? attachments.map(a=>a.id) : [];
  pending = {
    envelope: {version:1, sessionId:state.sessionId, command:{...command, id, ...(files.length ? {attachments:files} : {})}},
    text: draft.value,
    steer: command.kind==='queue' && !!state.canSteer,
    clearDraft: state.mode!=='pick' && (command.kind!=='action' || clearActionDraft)
  };
  if(message) {
    const label = [command.text.trim(), ...attachments.map(a=>'📎 '+a.name)].filter(Boolean).join(' · ');
    const text = command.text.trim();
    let occurrence;
    if ((state.agent?.history?.length || state.agent?.session?.turns?.length) && (command.kind==='input' || state.canSteer)) {
      occurrence = agentMessageCount(state.agent,text,files)+1;
      for (const earlier of outgoing.values()) {
        if (earlier.occurrence && earlier.text===text && earlier.files.join()===files.join())
          occurrence=Math.max(occurrence,earlier.occurrence+1);
      }
    }
    outgoing.set(id,{id,sessionId:state.sessionId,label,text,files,occurrence});
    el('feedback').textContent='Sending…';
    publishConversation(true);
  }
  sessionStorage.setItem('play-pending',JSON.stringify(pending));void deliver();
}
el('composer').onsubmit = event => {
  event.preventDefault(); if (!state || el('send').disabled) return;
  if (!draft.value.trim() && (!attachments.length || state.question || state.choices.length)) return;
  if (!state.question && !state.choices.length && draft.value.trimStart().startsWith('/')) { submitSlash(); return; }
  send(state.mode === 'busy' ? {kind:'queue', taskId:state.taskId, text:draft.value} : {kind:'input', promptId:state.promptId, text:draft.value});
};
el('stop').onclick = () => send({kind:'stop', taskId:state.taskId});
el('retry').onclick = deliver;
el('edit').onclick = () => openChat();
el('close').onclick = () => closeChat();
el('fullscreen').onclick = () => { const request = document.fullscreenElement ? document.exitFullscreen() : document.documentElement.requestFullscreen(); request.catch(() => { el('notice').textContent = 'Fullscreen is unavailable in this browser.'; }); };
function viewport() { document.body.dataset.compact=String((window.visualViewport?.height||window.innerHeight)<=520); document.documentElement.style.setProperty('--height', (window.visualViewport?.height || window.innerHeight) + 'px'); }
window.visualViewport?.addEventListener('resize', viewport); viewport();
async function apply(force=false,automatic=false) {
  if (liveOperation) { el('notice').textContent='Wait for the current game operation to finish.'; return; }
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
        observeBuild(build);
        el('notice').textContent = build.error && !build.busy ? '' : (build.busy || build.stale ? 'Building update…' : lastSwapError);
        if (!build.error && !build.busy && !build.stale && build.revision) {
          candidate = build.revision;
          if (!revision) await apply();
          else {el('apply').hidden=!resourceRecovery&&(candidate===revision||el('policy').value==='freeze');if(candidate!==revision&&el('policy').value==='auto'&&lastAuto!==candidate){const caps=await gameRequest(frame,'capabilities').catch(()=>null);const hot=build.hot?await gameRequest(frame,'hot:status').catch(()=>null):null;if(hot?.ready||caps?.validate&&caps.safe){lastAuto=candidate;await apply(false,true);}else el('notice').textContent='Update ready · waiting for a supported safe point, or apply manually.';}}
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
${LIVE_GAME_SCRIPT}
${LIVE_JOURNAL_SCRIPT}
${WORKBENCH_TOOLS_SCRIPT}
${WORKBENCH_NAVIGATION_SCRIPT}
${WORKBENCH_ONBOARDING_SCRIPT}
${WORKBENCH_BUILD_ERROR_SCRIPT}
const presencePath='/presence',presenceProtocols=['gamedevpl-presence','token.'+token];
${PLAY_PRESENCE_SCRIPT}
tick(); previewTick();
`;
