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
 * like a slider. Only the model lanes and the share exit talk to the server.
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

// `code` is opaque and server-signed; the client never decodes it.
export type RemixShare = { code: string; codeEditsExcluded?: boolean };

export type RemixApiError = Error & { status?: number; code?: string; reason?: string; category?: string };

// The author switched remix off, or the game never allowed it.
export function isRemixClosed(error: unknown): boolean {
  const { status, code } = (error ?? {}) as RemixApiError;
  return status === 403 && (code === 'remix_off' || code === 'not_remixable');
}

async function readJson<T>(response: Response): Promise<T> {
  if (!response.ok) {
    let code: string | undefined;
    let reason: string | undefined;
    let category: string | undefined;
    let message = `request failed with ${response.status}`;
    try {
      const payload = (await response.json()) as { error?: string; reason?: string; category?: string };
      if (typeof payload.error === 'string' && payload.error) {
        message = payload.error;
        code = payload.error;
      }
      if (typeof payload.reason === 'string') reason = payload.reason;
      if (typeof payload.category === 'string') category = payload.category;
    } catch {
      // Body may be empty; status is enough for the caller.
    }
    const error = new Error(message) as RemixApiError;
    error.status = response.status;
    error.code = code;
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

// Shared params from a signed `?remix=` code; null when the server refuses it.
export async function fetchSharedTune(slug: string, code: string): Promise<Record<string, EditorParamValue> | null> {
  try {
    const response = await fetch(
      `${API_BASE}/api/games/${encodeURIComponent(slug)}/shared-tune?code=${encodeURIComponent(code)}`,
      { credentials: 'include' },
    );
    if (!response.ok) return null;
    const { params } = (await response.json()) as { params?: unknown };
    return params && typeof params === 'object' && !Array.isArray(params)
      ? (params as Record<string, EditorParamValue>)
      : null;
  } catch {
    return null;
  }
}
