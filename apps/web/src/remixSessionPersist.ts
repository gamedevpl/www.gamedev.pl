import { getRemix, type RemixResume, type RemixSession } from './remixApi.js';
import type { EditorContentDoc, EditorParamValue } from './studioApi.js';

const PENDING_KEY = 'gdpl-remix-pending';
const LIVE_KEY = 'gdpl-remix-live';
const SNAPSHOT_VERSION = 1;
const MAX_SNAPSHOT_CHARS = 400_000;

export type RemixChatTurn = {
  id: string;
  role: 'user' | 'assistant';
  text: string;
  canUndo?: boolean;
  missed?: boolean;
};

export type RemixChanged = {
  text: string;
  canShare: boolean;
  undoCode?: boolean;
  broke?: boolean;
};

export type RemixNote = { kind: 'ok' | 'info' | 'error'; text: string };

export type RemixSnapshot = {
  v: typeof SNAPSHOT_VERSION;
  slug: string;
  remixId: string;
  expiresAt: number;
  remixOpen: boolean;
  chatExpanded: boolean;
  values: Record<string, EditorParamValue>;
  chatTurns: RemixChatTurn[];
  changed: RemixChanged | null;
  note: RemixNote | null;
  successCount: number;
  asked: string;
  utterance: string;
  contentDoc?: EditorContentDoc;
};

let memoryPending: string | null = null;
let memorySnapshot: string | null = null;

function storageGet(key: string, memory: string | null): string | null {
  if (memory !== null) return memory;
  try {
    return window.sessionStorage.getItem(key);
  } catch {
    return null;
  }
}

function storageSet(key: string, value: string): void {
  try {
    window.sessionStorage.setItem(key, value);
  } catch {
    // Memory copy is the fallback when storage throws.
  }
}

function storageRemove(key: string): void {
  try {
    window.sessionStorage.removeItem(key);
  } catch {
    // Memory copy is already gone.
  }
}

export function stashPending(slug: string, text: string): void {
  const payload = JSON.stringify({ slug, text });
  memoryPending = payload;
  storageSet(PENDING_KEY, payload);
}

// Returns pending text for slug, clearing it either way.
export function takePending(slug: string): string | null {
  const raw = storageGet(PENDING_KEY, memoryPending);
  const clear = () => {
    memoryPending = null;
    storageRemove(PENDING_KEY);
  };
  if (raw === null) return null;
  try {
    const parsed = JSON.parse(raw) as { slug?: string; text?: string };
    if (typeof parsed.text !== 'string' || parsed.slug !== slug) {
      clear();
      return null;
    }
    clear();
    return parsed.text;
  } catch {
    clear();
    return null;
  }
}

export function readRemixSnapshot(slug: string): RemixSnapshot | null {
  const raw = storageGet(LIVE_KEY, memorySnapshot);
  if (raw === null) return null;
  try {
    const parsed = JSON.parse(raw) as RemixSnapshot;
    if (parsed.v !== SNAPSHOT_VERSION || parsed.slug !== slug) return null;
    if (typeof parsed.remixId !== 'string' || parsed.expiresAt <= Date.now()) {
      clearRemixSnapshot();
      return null;
    }
    return parsed;
  } catch {
    clearRemixSnapshot();
    return null;
  }
}

export function writeRemixSnapshot(snapshot: RemixSnapshot): void {
  let payload: RemixSnapshot = snapshot;
  let raw = JSON.stringify(payload);
  if (raw.length > MAX_SNAPSHOT_CHARS && payload.contentDoc) {
    payload = { ...payload };
    delete payload.contentDoc;
    raw = JSON.stringify(payload);
  }
  if (raw.length > MAX_SNAPSHOT_CHARS) return;
  memorySnapshot = raw;
  storageSet(LIVE_KEY, raw);
}

export function clearRemixSnapshot(): void {
  memorySnapshot = null;
  storageRemove(LIVE_KEY);
}

export function sessionFromResume(live: RemixResume): RemixSession {
  return {
    remixId: live.remixId,
    params: live.params,
    values: live.values,
    content: live.content,
    layers: live.layers,
    constraints: live.constraints,
    contentDefaults: live.contentDefaults,
    canAssist: live.canAssist,
    canCode: live.canCode,
    suggestions: live.suggestions,
    expiresInMs: live.expiresInMs,
    turns: live.turns,
  };
}

export async function resumeRemixForSlug(slug: string): Promise<{
  live: RemixResume;
  snapshot: RemixSnapshot;
} | null> {
  const snapshot = readRemixSnapshot(slug);
  if (!snapshot) return null;
  try {
    const live = await getRemix(snapshot.remixId);
    return { live, snapshot };
  } catch {
    clearRemixSnapshot();
    return null;
  }
}

export function chatTurnsFromServer(
  turns: Array<{ utterance: string; summary?: string }> | undefined,
): RemixChatTurn[] {
  if (!turns?.length) return [];
  const out: RemixChatTurn[] = [];
  for (const [index, turn] of turns.entries()) {
    const asked = turn.utterance.trim();
    if (asked) out.push({ id: `s-${index}-u`, role: 'user', text: asked });
    const reply = turn.summary?.trim();
    if (reply) out.push({ id: `s-${index}-a`, role: 'assistant', text: reply });
  }
  return out;
}
