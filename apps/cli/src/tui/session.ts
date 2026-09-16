import type { History } from './history.js';
export type TuiMode = 'prompt' | 'pick' | 'busy';

export type TuiState = {
  lines: string[];
  live: string[];
  localTask: string;
  previewUrl: string;
  identity: string;
  question: string;
  mode: TuiMode;
  activity: string;
  busySince: number;
  lastOutputAt: number;
  draft: string;
  draftCursor: number;
  draftFromHistory: boolean;
  choices: string[];
  pickIndex: number;
  queued: string[];
};

export type TuiSession = {
  get: () => TuiState;
  subscribe: (fn: (state: TuiState) => void) => () => void;
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
  restoreHistory: (saved: History) => void;
  savedHistory: () => History;
};

export function formatSessionIdentity(who: string, slug: string): string {
  return [who, slug].filter(Boolean).join(' · ');
}

export function createTuiSession(banner: string, onBusyCancel?: () => void): TuiSession {
  let state: TuiState = {
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
  };
  const listeners = new Set<(next: TuiState) => void>();
  let pending: ((line: string) => void) | null = null;
  const history: string[] = [];
  let savedLines: string[] = [];
  let histIndex = 0;
  let stash = '';
  let followupDraft = '';

  const emit = (): void => {
    for (const listener of listeners) listener(state);
  };

  return {
    queueDraft() {
      const text = state.draft.trim();
      if (state.mode !== 'busy' || !state.localTask || !text) return;
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
      state = { ...state, localTask };
      emit();
    },
    setLive(live) {
      state = { ...state, live: live.slice(0, 4) };
      emit();
    },
    setActivity(activity) {
      if (state.mode !== 'busy') return;
      state = { ...state, activity };
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
      const nextTurn = choices === undefined && question === undefined;
      if (state.mode === 'busy' && state.draft) followupDraft = state.draft;
      if (nextTurn && state.queued.length) {
        const [line, ...queued] = state.queued;
        state = { ...state, queued };
        savedLines = [...savedLines, `› ${line}`].slice(-200);
        history.push(line!);
        if (history.length > 50) history.shift();
        state = { ...state, lines: [...state.lines, `› ${line}`] };
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
      if (!pending) return;
      const line = state.mode === 'pick' ? (state.choices[state.pickIndex] ?? '') : state.draft;
      const resolve = pending;
      pending = null;
      const spoken = line.trim() ? [...state.lines, `› ${line}`] : state.lines;
      if (line.trim()) savedLines = [...savedLines, `› ${line}`].slice(-200);
      if (line.trim() && history[history.length - 1] !== line.trim()) {
        history.push(line.trim());
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
    },
    cancel() {
      if (state.mode === 'prompt' && state.draft) {
        state = { ...state, draft: '', draftCursor: 0 };
        emit();
        return;
      }
      if (!pending) {
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
      listeners.clear();
      if (pending) {
        pending('/quit');
        pending = null;
      }
    },
  };
}
