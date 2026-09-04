export type TuiMode = 'prompt' | 'pick' | 'busy';

export type TuiState = {
  lines: string[];
  live: string[];
  identity: string;
  question: string;
  mode: TuiMode;
  draft: string;
  choices: string[];
  pickIndex: number;
};

export type TuiSession = {
  get: () => TuiState;
  subscribe: (fn: (state: TuiState) => void) => () => void;
  writeLine: (text: string) => void;
  setLive: (live: string[]) => void;
  setIdentity: (identity: string) => void;
  setDraft: (draft: string) => void;
  deleteLast: () => void;
  movePick: (delta: number) => void;
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
    identity: '',
    question: '',
    mode: 'busy',
    draft: '',
    choices: [],
    pickIndex: 0,
  };
  const listeners = new Set<(next: TuiState) => void>();
  let pending: ((line: string) => void) | null = null;

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
      state = { ...state, lines: [...state.lines, ...text.split('\n')] };
      emit();
    },
    setLive(live) {
      state = { ...state, live: live.slice(0, 4) };
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
      state = { ...state, draft: next };
      emit();
    },
    deleteLast() {
      const chars = [...state.draft];
      chars.pop();
      state = { ...state, draft: chars.join('') };
      emit();
    },
    movePick(delta) {
      const n = state.choices.length;
      if (!n) return;
      state = { ...state, pickIndex: (state.pickIndex + delta + n) % n };
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
        state = {
          ...state,
          mode: choices?.length ? 'pick' : 'prompt',
          choices: choices ?? [],
          question: question ?? '',
          pickIndex: 0,
          draft: '',
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
      state = { ...state, lines: spoken, mode: 'busy', draft: '', choices: [], question: '', pickIndex: 0 };
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
