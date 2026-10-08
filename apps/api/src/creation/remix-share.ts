import { createHmac, timingSafeEqual } from 'node:crypto';
import { EDITOR_CONTENT_FILE, PARAMS_KEY, type EditorDefinition } from './editor-contract.js';
import { applyAssistPatches } from './editor-assist.js';
import { defaultCollections } from './remix-bake.js';

export type SharedParams = Record<string, string | number | boolean>;

// Codes longer than this are refused before any parsing.
export const MAX_SHARE_CODE_LENGTH = 4_096;

function sign(payload: string, slug: string, secret: string): string {
  return createHmac('sha256', secret).update(`remix-share:v1:${slug}:${payload}`).digest('base64url');
}

// `<base64url(json)>.<hmac>`, bound to the slug it was minted for.
export function mintShareCode(params: SharedParams, slug: string, secret: string): string {
  const payload = Buffer.from(JSON.stringify(params), 'utf8').toString('base64url');
  return `${payload}.${sign(payload, slug, secret)}`;
}

// Null for anything unsigned, forged, malformed, or minted for another game.
export function readShareCode(code: string, slug: string, secret: string): SharedParams | null {
  if (!code || code.length > MAX_SHARE_CODE_LENGTH) return null;
  const parts = code.split('.');
  if (parts.length !== 2) return null;
  const [payload, mac] = parts;
  const expected = Buffer.from(sign(payload, slug, secret));
  const given = Buffer.from(mac);
  if (expected.length !== given.length || !timingSafeEqual(expected, given)) return null;
  try {
    const parsed: unknown = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return null;
    const out: SharedParams = {};
    for (const [key, value] of Object.entries(parsed as Record<string, unknown>)) {
      if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') out[key] = value;
    }
    return out;
  } catch {
    return null;
  }
}

// Clamps, enum-checks, and truncates values against the current declaration.
export function validateSharedParams(
  definition: EditorDefinition,
  sources: Record<string, string>,
  values: SharedParams,
): SharedParams {
  const specs = definition.params ?? {};
  const { patches } = applyAssistPatches(
    definition,
    {
      ...defaultCollections(definition, sources[EDITOR_CONTENT_FILE]),
      [PARAMS_KEY]: Object.fromEntries(Object.entries(specs).map(([key, spec]) => [key, spec.default])),
    },
    Object.entries(values).map(([key, value]) => ({ key, value })),
  );
  return Object.fromEntries(patches.map((patch) => [patch.key, patch.value]));
}

// The non-empty text-param values, for moderation.
export function sharedTexts(definition: EditorDefinition, values: SharedParams): string[] {
  return Object.entries(definition.params ?? {})
    .filter(([name, spec]) => spec.type === 'text' && typeof values[name] === 'string')
    .map(([name]) => values[name] as string)
    .filter((text) => text.trim().length > 0);
}
