import type { EditorLabel, EditorParamSpec, EditorParamValue } from './studioApi.js';

const API_BASE = import.meta.env.VITE_API_BASE_URL ?? '';

/**
 * The player-facing half of live editing (ops repo: realtime-game-editing-plan §D).
 *
 * A remix needs no account and never publishes. Parameter values live here in the
 * browser and reach the running game over the existing `editor:content` bridge —
 * no round trip, which is what makes a slider feel like a slider. Only the two
 * model lanes talk to the server.
 */

export type RemixSession = {
  remixId: string;
  params: Record<string, EditorParamSpec> | null;
  values: Record<string, EditorParamValue> | null;
  canAssist: boolean;
  canCode: boolean;
  expiresInMs: number;
};

export type RemixAssistResponse = {
  lane: 'params' | 'content' | 'code' | 'reject';
  patches?: Array<{ key: string; value: EditorParamValue }>;
  values?: Record<string, EditorParamValue>;
  summary?: EditorLabel;
};

export type RemixCodeResponse =
  | { ok: true; html: string; region: { file: string; name: string }; summary?: EditorLabel }
  | { ok: false; reason: 'no_region' | 'refused' | 'did_not_compile' | 'error'; summary?: EditorLabel };

export type RemixShare = {
  slug: string;
  params: Record<string, EditorParamValue>;
  code: string;
  codeEditsExcluded: boolean;
};

export type RemixApiError = Error & { status?: number };

async function post<T>(path: string, body?: unknown, signal?: AbortSignal): Promise<T> {
  const response = await fetch(`${API_BASE}${path}`, {
    method: 'POST',
    credentials: 'include',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body ?? {}),
    ...(signal ? { signal } : {}),
  });
  if (!response.ok) {
    const error = new Error(`request failed with ${response.status}`) as RemixApiError;
    error.status = response.status;
    throw error;
  }
  return (await response.json()) as T;
}

export function startRemix(slug: string): Promise<RemixSession> {
  return post<RemixSession>(`/api/games/${encodeURIComponent(slug)}/remix`);
}

export function remixAssist(
  remixId: string,
  utterance: string,
  params: Record<string, EditorParamValue>,
): Promise<RemixAssistResponse> {
  return post<RemixAssistResponse>(`/api/remixes/${encodeURIComponent(remixId)}/assist`, { utterance, params });
}

export function remixCode(remixId: string, utterance: string, signal?: AbortSignal): Promise<RemixCodeResponse> {
  return post<RemixCodeResponse>(`/api/remixes/${encodeURIComponent(remixId)}/code`, { utterance }, signal);
}

export function remixShare(remixId: string, params: Record<string, EditorParamValue>): Promise<RemixShare> {
  return post<RemixShare>(`/api/remixes/${encodeURIComponent(remixId)}/share`, { params });
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
