import type { AssistLane, RemixSuggestion } from '@gamedevpl/contract';
import type {
  EditorCollectionSpec,
  EditorContentDoc,
  EditorLayerConstraint,
  EditorLayerSpec,
  EditorLabel,
  EditorParamSpec,
  EditorParamValue,
} from './studioApi.js';

const API_BASE = import.meta.env.VITE_API_BASE_URL ?? '';

/**
 * A remix needs a session and never publishes on its own. Parameter values live
 * here in the browser and reach the running game over the existing
 * `editor:content` bridge — no round trip, which is what makes a slider feel
 * like a slider. Only the model lanes and the save/share exits talk to the
 * server.
 */

export type { RemixSuggestion };

export type RemixSession = {
  remixId: string;
  params: Record<string, EditorParamSpec> | null;
  values: Record<string, EditorParamValue> | null;
  /**
   * The collections half of the game's declaration, defaults included — what
   * the painter renders. Absent from an older server; null when the game
   * declares only tunables. Painted content never travels back to the server:
   * it lives in this session and reaches the game over the bridge like params.
   */
  content?: Record<string, EditorCollectionSpec> | null;
  layers?: Record<string, EditorLayerSpec> | null;
  constraints?: EditorLayerConstraint[] | null;
  contentDefaults?: EditorContentDoc;
  canAssist: boolean;
  canCode: boolean;
  /** Absent from an older server; an empty list is the same as none. */
  suggestions?: RemixSuggestion[];
  expiresInMs: number;
  /** Prior asks, when a resume route rebuilt the conversation. */
  turns?: Array<{ utterance: string; summary?: string }>;
};

export type RemixResume = RemixSession & {
  html?: string | null;
  undoable?: boolean;
  // True when this instance rebuilt an empty session around the id.
  rehydrated?: boolean;
};

export type RemixAssistResponse = {
  lane: AssistLane;
  patches?: Array<{ key: string; value: EditorParamValue }>;
  values?: Record<string, EditorParamValue>;
  summary?: EditorLabel;
};

export type RemixCodeResponse =
  | { ok: true; html: string; undoable?: boolean; region: { file: string; name: string }; summary?: EditorLabel }
  | { ok: false; reason: 'no_region' | 'refused' | 'did_not_compile' | 'error'; summary?: EditorLabel };

export type RemixShare = {
  slug: string;
  params: Record<string, EditorParamValue>;
  code: string;
  codeEditsExcluded: boolean;
};

export type RemixSave = {
  slug: string;
  token: string;
  version: string;
  /** Where to open the kept remix — `/play/<slug>`, not Studio. */
  openPath: string;
};

export type RemixApiError = Error & { status?: number; reason?: string; category?: string };

async function readJson<T>(response: Response): Promise<T> {
  if (!response.ok) {
    let reason: string | undefined;
    let category: string | undefined;
    let message = `request failed with ${response.status}`;
    try {
      const payload = (await response.json()) as { error?: string; reason?: string; category?: string };
      if (typeof payload.error === 'string' && payload.error) message = payload.error;
      if (typeof payload.reason === 'string') reason = payload.reason;
      if (typeof payload.category === 'string') category = payload.category;
    } catch {
      // Body may be empty; status is enough for the caller.
    }
    const error = new Error(message) as RemixApiError;
    error.status = response.status;
    error.reason = reason;
    error.category = category;
    throw error;
  }
  return (await response.json()) as T;
}

async function post<T>(path: string, body?: unknown, signal?: AbortSignal): Promise<T> {
  const response = await fetch(`${API_BASE}${path}`, {
    method: 'POST',
    credentials: 'include',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body ?? {}),
    ...(signal ? { signal } : {}),
  });
  return readJson<T>(response);
}

export function startRemix(slug: string): Promise<RemixSession> {
  return post<RemixSession>(`/api/games/${encodeURIComponent(slug)}/remix`);
}

export function getRemix(remixId: string): Promise<RemixResume> {
  return fetch(`${API_BASE}/api/remixes/${encodeURIComponent(remixId)}`, { credentials: 'include' }).then((response) =>
    readJson<RemixResume>(response),
  );
}

export function remixAssist(
  remixId: string,
  utterance: string,
  params: Record<string, EditorParamValue>,
  locale?: string,
): Promise<RemixAssistResponse> {
  return post<RemixAssistResponse>(`/api/remixes/${encodeURIComponent(remixId)}/assist`, {
    utterance,
    params,
    ...(locale ? { locale } : {}),
  });
}

export function remixCode(
  remixId: string,
  utterance: string,
  signal?: AbortSignal,
  locale?: string,
): Promise<RemixCodeResponse> {
  return post<RemixCodeResponse>(
    `/api/remixes/${encodeURIComponent(remixId)}/code`,
    { utterance, ...(locale ? { locale } : {}) },
    signal,
  );
}

/**
 * One step back, server-side.
 *
 * Not a client-side swap: the session is what the *next* edit builds on, so
 * restoring the document in the browser while leaving the broken source on the
 * server would quietly compound the damage.
 */
export function remixUndo(remixId: string): Promise<{ ok: true; html: string; undoable: boolean }> {
  return post<{ ok: true; html: string; undoable: boolean }>(`/api/remixes/${encodeURIComponent(remixId)}/undo`);
}

export function remixShare(remixId: string, params: Record<string, EditorParamValue>): Promise<RemixShare> {
  return post<RemixShare>(`/api/remixes/${encodeURIComponent(remixId)}/share`, { params });
}

/**
 * Fork the remixed sources into a private Studio draft under a new slug.
 *
 * Never publishes. Params and painted content travel with the request so the
 * server can bake them into EDITOR.json — they never lived there during the
 * ephemeral remix.
 */
export function remixSave(
  remixId: string,
  body: {
    title?: string;
    params?: Record<string, EditorParamValue>;
    content?: EditorContentDoc;
  },
): Promise<RemixSave> {
  return post<RemixSave>(`/api/remixes/${encodeURIComponent(remixId)}/save`, body);
}

/**
 * Read shared parameter values out of the URL.
 *
 * Values are re-checked against the game's own declaration before they are
 * applied, so a hand-edited link is worth exactly as much as the schema allows.
 */
export function readSharedParams(search: string): Record<string, EditorParamValue> | null {
  const code = new URLSearchParams(search).get('remix');
  if (!code) return null;
  try {
    const decoded = JSON.parse(atob(code.replace(/-/g, '+').replace(/_/g, '/')));
    return decoded && typeof decoded === 'object' && !Array.isArray(decoded) ? decoded : null;
  } catch {
    return null;
  }
}

/** Keep only values the declaration allows — the client half of the same rule. */
export function coerceSharedParams(
  specs: Record<string, EditorParamSpec>,
  incoming: Record<string, EditorParamValue>,
): Record<string, EditorParamValue> {
  const out: Record<string, EditorParamValue> = {};
  for (const [key, spec] of Object.entries(specs)) {
    const value = Object.hasOwn(incoming, key) ? incoming[key] : undefined;
    if (value === undefined) {
      out[key] = spec.default;
      continue;
    }
    if (spec.type === 'int' || spec.type === 'number') {
      const numeric = typeof value === 'number' && Number.isFinite(value) ? value : spec.default;
      const clamped = Math.min(spec.max, Math.max(spec.min, numeric as number));
      out[key] = spec.type === 'int' ? Math.round(clamped) : clamped;
    } else if (spec.type === 'bool') {
      out[key] = typeof value === 'boolean' ? value : spec.default;
    } else if (spec.type === 'enum') {
      out[key] = typeof value === 'string' && spec.values.includes(value) ? value : spec.default;
    } else {
      out[key] = typeof value === 'string' ? value.slice(0, spec.max) : spec.default;
    }
  }
  return out;
}
