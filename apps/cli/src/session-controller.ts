import { shownPrompt, splitEvidence } from './workbench-evidence.js';
import type { Steer } from './live-agent.js';
export type SessionHistory = { lines: string[]; prompts: string[]; conversationId?: string };
export type SessionMode = 'prompt' | 'pick' | 'busy';

export type SessionState = {
  lines: string[];
  live: string[];
  localTask: string;
  previewUrl: string;
  identity: string;
  question: string;
  mode: SessionMode;
  activity: string;
  busySince: number;
  lastOutputAt: number;
  draft: string;
  draftCursor: number;
  draftFromHistory: boolean;
  choices: string[];
  pickIndex: number;
  queued: string[];
  canSteer: boolean;
  sending: boolean;
  sendStatus: string;
  promptId: number;
  taskId: number;
};

export type SessionController = {
  get: () => SessionState;
  subscribe: (fn: (state: SessionState) => void) => () => void;
  writeLine: (text: string) => void;
  clearPreview: () => void;
  setLive: (live: string[]) => void;
  setLocalTask: (agent: string) => void;
  setIdentity: (identity: string) => void;
  setActivity: (activity: string) => void;
  setDraft: (draft: string) => void;
  insertDraft: (text: string) => void;
  moveDraftCursor: (delta: number) => void;
  deleteLast: () => void;
  movePick: (delta: number) => void;
  historyPrev: () => void;
  historyNext: () => void;
  prompt: (choices?: string[], question?: string) => Promise<string>;
  submit: () => void;
  cancel: () => void;
  close: () => void;
  queueDraft: () => void;
  setSteering: (send: Steer | undefined) => void;
  sendDraft: () => Promise<void>;
  acceptInput: (text: string, promptId: number) => boolean;
  enqueueInput: (text: string, taskId: number) => boolean;
  stopTask: (taskId: number) => boolean;
  restoreHistory: (saved: SessionHistory) => void;
  savedHistory: () => SessionHistory;
};

export function formatSessionIdentity(who: string, slug: string): string {
  return [who, slug].filter(Boolean).join(' · ');
}

export function createSessionController(banner: string, onBusyCancel?: () => void): SessionController {
  let state: SessionState = {
    lines: banner ? banner.split('\n') : [],
    live: [],
    localTask: '',
    previewUrl: '',
    identity: '',
    question: '',
    mode: 'busy',
    activity: 'Starting gamedevpl',
    busySince: Date.now(),
    lastOutputAt: Date.now(),
    draft: '',
    draftCursor: 0,
    draftFromHistory: false,
    choices: [],
    pickIndex: 0,
    queued: [],
    canSteer: false,
    sending: false,
    sendStatus: '',
    promptId: 0,
    taskId: 0,
  };
  const listeners = new Set<(next: SessionState) => void>();
  let pending: ((line: string) => void) | null = null;
  const history: string[] = [];
  let savedLines: string[] = [];
  let histIndex = 0;
  let stash = '';
  let followupDraft = '';
  let steer: Steer | undefined;
  let closed = false;
  let stopping = false;

  const emit = (): void => {
    for (const listener of listeners) {
      try {
        listener(state);
      } catch {
        listeners.delete(listener);
      }
    }
  };

  const submitLine = (line: string): boolean => {
    if (!pending) return false;
    const resolve = pending;
    pending = null;
    const typed = splitEvidence(line).text.trim();
    const spoken = line.trim() ? [...state.lines, `› ${shownPrompt(line)}`] : state.lines;
    if (line.trim()) savedLines = [...savedLines, `› ${shownPrompt(line)}`].slice(-200);
    if (typed && history[history.length - 1] !== typed) {
      history.push(typed);
      if (history.length > 50) history.shift();
    }
    histIndex = history.length;
    stash = '';
    state = {
      ...state,
      lines: spoken,
      mode: 'busy',
      activity: state.mode === 'pick' ? 'Continuing' : 'Working on your request',
      busySince: Date.now(),
      lastOutputAt: Date.now(),
      draft: '',
      draftCursor: 0,
      choices: [],
      question: '',
      pickIndex: 0,
    };
    emit();
    resolve(line);
    return true;
  };

  return {
    setSteering(send) {
      steer = send;
      state = { ...state, canSteer: Boolean(send) };
      emit();
    },
    async sendDraft() {
      const text = state.draft.trim();
      const send = steer;
      if (closed || stopping || !send || !text || state.sending || state.mode !== 'busy') return;
      state = { ...state, sending: true, sendStatus: 'Sending to the active agent…' };
      emit();
      try {
        await send(text);
        const shown = `› [sent to active agent] ${text}`;
        savedLines = [...savedLines, shown].slice(-200);
        history.push(text);
        if (history.length > 50) history.shift();
        if (followupDraft.trim() === text) followupDraft = '';
        state = {
          ...state,
          lines: [...state.lines, shown],
          sendStatus: 'Accepted by the agent',
          ...(state.draft.trim() === text ? { draft: '', draftCursor: 0 } : {}),
        };
      } catch (error) {
        const status = `${error instanceof Error ? error.message : 'Sending failed.'} Message saved in history.`;
        const shown = `› [delivery not confirmed] ${text}`;
        savedLines = [...savedLines, shown, status].slice(-200);
        history.push(text);
        if (history.length > 50) history.shift();
        histIndex = history.length;
        state = { ...state, lines: [...state.lines, shown, status], sendStatus: status };
      } finally {
        state = { ...state, sending: false };
        emit();
      }
    },
    acceptInput(text, promptId) {
      if (closed || !pending || promptId !== state.promptId) return false;
      if (state.mode === 'pick' && !state.choices.includes(text)) return false;
      if (state.mode !== 'pick' && state.mode !== 'prompt') return false;
      if (state.mode === 'prompt' && state.draft) {
        if (state.question) return false;
        followupDraft = state.draft;
      }
      return submitLine(text);
    },
    enqueueInput(text, taskId) {
      if (closed || stopping || !state.localTask || state.mode !== 'busy' || taskId !== state.taskId) return false;
      if (state.queued.length >= 50) return false;
      state = { ...state, queued: [...state.queued, text] };
      emit();
      return true;
    },
    stopTask(taskId) {
      if (closed || stopping || !state.localTask || state.mode !== 'busy' || taskId !== state.taskId) return false;
      stopping = true;
      state = { ...state, queued: [] };
      emit();
      onBusyCancel?.();
      return true;
    },
    queueDraft() {
      const text = state.draft.trim();
      if (
        closed ||
        stopping ||
        state.sending ||
        state.mode !== 'busy' ||
        !state.localTask ||
        !text ||
        state.queued.length >= 50
      )
        return;
      state = { ...state, queued: [...state.queued, text], draft: '', draftCursor: 0 };
      emit();
    },
    restoreHistory(saved) {
      history.splice(0, history.length, ...saved.prompts);
      histIndex = history.length;
      savedLines = [...saved.lines];
      if (saved.lines.length) {
        state = {
          ...state,
          lines: [...state.lines, 'Previous conversation (local history):', ...saved.lines, 'Current session:'],
        };
        emit();
      }
    },
    savedHistory() {
      return { lines: savedLines, prompts: [...history] };
    },
    get() {
      return state;
    },
    subscribe(fn) {
      listeners.add(fn);
      fn(state);
      return () => {
        listeners.delete(fn);
      };
    },
    writeLine(text) {
      savedLines = [...savedLines, ...text.split('\n')].slice(-200);
      const preview = /^(?:local live preview|live preview while .* edits): (https?:\/\/\S+)/m.exec(text)?.[1];
      const previewStopped = /^(?:local preview stopped|no local preview is running)$/m.test(text);
      state = {
        ...state,
        lines: [...state.lines, ...text.split('\n')],
        lastOutputAt: Date.now(),
        previewUrl: previewStopped ? '' : (preview ?? state.previewUrl),
      };
      emit();
    },
    clearPreview() {
      if (!state.previewUrl) return;
      state = { ...state, previewUrl: '' };
      emit();
    },
    setLocalTask(localTask) {
      stopping = false;
      state = { ...state, localTask, sendStatus: '', taskId: state.taskId + 1 };
      emit();
    },
    setLive(live) {
      state = { ...state, live: live.slice(0, 4) };
      emit();
    },
    setActivity(activity) {
      if (state.mode !== 'busy') return;
      state = { ...state, activity, lastOutputAt: Date.now() };
      emit();
    },
    setIdentity(identity) {
      state = { ...state, identity };
      emit();
    },
    setDraft(draft) {
      let next = '';
      for (const ch of draft) {
        const code = ch.charCodeAt(0);
        if (code >= 32 && code !== 127 && (code < 0x80 || code > 0x9f)) next += ch;
      }
      histIndex = history.length;
      state = { ...state, draft: next, draftCursor: [...next].length, draftFromHistory: false };
      emit();
    },
    insertDraft(text) {
      let insert = '';
      for (const ch of text) {
        const code = ch.charCodeAt(0);
        if (code >= 32 && code !== 127 && (code < 0x80 || code > 0x9f)) insert += ch;
      }
      if (!insert) return;
      const chars = [...state.draft];
      const added = [...insert];
      chars.splice(state.draftCursor, 0, ...added);
      histIndex = history.length;
      state = {
        ...state,
        draft: chars.join(''),
        draftCursor: state.draftCursor + added.length,
        draftFromHistory: false,
      };
      emit();
    },
    moveDraftCursor(delta) {
      const next = Math.max(0, Math.min([...state.draft].length, state.draftCursor + delta));
      if (next === state.draftCursor) return;
      state = { ...state, draftCursor: next };
      emit();
    },
    deleteLast() {
      if (state.draftCursor === 0) return;
      const chars = [...state.draft];
      chars.splice(state.draftCursor - 1, 1);
      histIndex = history.length;
      state = {
        ...state,
        draft: chars.join(''),
        draftCursor: state.draftCursor - 1,
        draftFromHistory: false,
      };
      emit();
    },
    movePick(delta) {
      const n = state.choices.length;
      if (!n) return;
      state = { ...state, pickIndex: (state.pickIndex + delta + n) % n };
      emit();
    },
    historyPrev() {
      if (state.mode !== 'prompt' || !history.length || histIndex === 0) return;
      if (histIndex === history.length) stash = state.draft;
      histIndex -= 1;
      const draft = history[histIndex] ?? '';
      state = { ...state, draft, draftCursor: [...draft].length, draftFromHistory: true };
      emit();
    },
    historyNext() {
      if (state.mode !== 'prompt' || histIndex >= history.length) return;
      histIndex += 1;
      const draft = histIndex === history.length ? stash : (history[histIndex] ?? '');
      state = {
        ...state,
        draft,
        draftCursor: [...draft].length,
        draftFromHistory: true,
      };
      emit();
    },
    prompt(choices, question) {
      if (closed) return Promise.resolve('/quit');
      const nextTurn = choices === undefined && question === undefined;
      if (state.mode === 'busy' && state.draft) followupDraft = state.draft;
      if (nextTurn && state.queued.length) {
        const [line, ...queued] = state.queued;
        state = { ...state, queued };
        savedLines = [...savedLines, `› ${shownPrompt(line!)}`].slice(-200);
        history.push(splitEvidence(line!).text);
        if (history.length > 50) history.shift();
        state = { ...state, lines: [...state.lines, `› ${shownPrompt(line!)}`] };
        emit();
        return Promise.resolve(line!);
      }
      if (pending) {
        const stale = pending;
        pending = null;
        stale('');
      }
      return new Promise((resolve) => {
        pending = resolve;
        histIndex = history.length;
        stash = '';
        state = {
          ...state,
          mode: choices?.length ? 'pick' : 'prompt',
          promptId: state.promptId + 1,
          choices: choices ?? [],
          question: question ?? '',
          pickIndex: 0,
          draft: nextTurn ? followupDraft : '',
          draftCursor: nextTurn ? [...followupDraft].length : 0,
          draftFromHistory: false,
        };
        if (nextTurn) followupDraft = '';
        emit();
      });
    },
    submit() {
      submitLine(state.mode === 'pick' ? (state.choices[state.pickIndex] ?? '') : state.draft);
    },
    cancel() {
      if (state.mode === 'prompt' && state.draft) {
        state = { ...state, draft: '', draftCursor: 0 };
        emit();
        return;
      }
      if (!pending) {
        if (state.localTask) stopping = true;
        state = { ...state, queued: [] };
        emit();
        onBusyCancel?.();
        return;
      }
      const resolve = pending;
      pending = null;
      state = { ...state, mode: 'busy', draft: '', draftCursor: 0, choices: [], question: '', pickIndex: 0 };
      emit();
      resolve('/quit');
    },
    close() {
      closed = true;
      listeners.clear();
      if (pending) {
        pending('/quit');
        pending = null;
      }
    },
  };
}
