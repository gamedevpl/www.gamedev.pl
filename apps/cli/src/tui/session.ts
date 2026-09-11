export type TuiMode = 'prompt' | 'pick' | 'busy';

export type TuiState = {
  lines: string[];
  live: string[];
  localTask: string;
  identity: string;
  question: string;
  mode: TuiMode;
  activity: string;
  busySince: number;
  lastOutputAt: number;
  draft: string;
  draftFromHistory: boolean;
  choices: string[];
  pickIndex: number;
};

export type TuiSession = {
  get: () => TuiState;
  subscribe: (fn: (state: TuiState) => void) => () => void;
  writeLine: (text: string) => void;
  setLive: (live: string[]) => void;
  setLocalTask: (agent: string) => void;
  setIdentity: (identity: string) => void;
  setActivity: (activity: string) => void;
  setDraft: (draft: string) => void;
  deleteLast: () => void;
  movePick: (delta: number) => void;
  historyPrev: () => void;
  historyNext: () => void;
  prompt: (choices?: string[], question?: string) => Promise<string>;
  submit: () => void;
  cancel: () => void;
  close: () => void;
};

export function formatSessionIdentity(who: string, slug: string): string {
  return [who, slug].filter(Boolean).join(' · ');
}

export function createTuiSession(banner: string, onBusyCancel?: () => void): TuiSession {
  let state: TuiState = {
    lines: banner ? banner.split('\n') : [],
    live: [],
    localTask: '',
    identity: '',
    question: '',
    mode: 'busy',
    activity: 'Starting gamedevpl',
    busySince: Date.now(),
    lastOutputAt: Date.now(),
    draft: '',
    draftFromHistory: false,
    choices: [],
    pickIndex: 0,
  };
  const listeners = new Set<(next: TuiState) => void>();
  let pending: ((line: string) => void) | null = null;
  const history: string[] = [];
  let histIndex = 0;
  let stash = '';

  const emit = (): void => {
    for (const listener of listeners) listener(state);
  };

  return {
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
      state = { ...state, lines: [...state.lines, ...text.split('\n')], lastOutputAt: Date.now() };
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
      state = { ...state, draft: next, draftFromHistory: false };
      emit();
    },
    deleteLast() {
      const chars = [...state.draft];
      chars.pop();
      histIndex = history.length;
      state = { ...state, draft: chars.join(''), draftFromHistory: false };
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
      state = { ...state, draft: history[histIndex] ?? '', draftFromHistory: true };
      emit();
    },
    historyNext() {
      if (state.mode !== 'prompt' || histIndex >= history.length) return;
      histIndex += 1;
      state = {
        ...state,
        draft: histIndex === history.length ? stash : (history[histIndex] ?? ''),
        draftFromHistory: true,
      };
      emit();
    },
    prompt(choices, question) {
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
          draft: '',
          draftFromHistory: false,
        };
        emit();
      });
    },
    submit() {
      if (!pending) return;
      const line = state.mode === 'pick' ? (state.choices[state.pickIndex] ?? '') : state.draft;
      const resolve = pending;
      pending = null;
      const spoken = line.trim() ? [...state.lines, `› ${line}`] : state.lines;
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
        choices: [],
        question: '',
        pickIndex: 0,
      };
      emit();
      resolve(line);
    },
    cancel() {
      if (state.mode === 'prompt' && state.draft) {
        state = { ...state, draft: '' };
        emit();
        return;
      }
      if (!pending) {
        onBusyCancel?.();
        return;
      }
      const resolve = pending;
      pending = null;
      state = { ...state, mode: 'busy', draft: '', choices: [], question: '', pickIndex: 0 };
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
