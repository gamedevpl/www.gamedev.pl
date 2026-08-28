import { buildSuggestions } from './remix-suggestions.js';
import type { EditorDefinition } from './editor-contract.js';
import type { RemixTurn } from './remix-turns.js';

// Start and resume send this same JSON.
export function remixClientPayload(input: {
  remixId: string;
  definition: EditorDefinition | null;
  contentDefaults: Record<string, unknown>;
  canAssist: boolean;
  canCode: boolean;
  expiresInMs: number;
  html?: string | null;
  undoable?: boolean;
  turns?: RemixTurn[];
  rehydrated?: boolean;
}): Record<string, unknown> {
  const { definition, canAssist, canCode } = input;
  return {
    remixId: input.remixId,
    params: definition?.params ?? null,
    values: definition?.params
      ? Object.fromEntries(Object.entries(definition.params).map(([key, spec]) => [key, spec.default]))
      : null,
    content: definition && Object.keys(definition.content).length > 0 ? definition.content : null,
    layers: definition && definition.layers && Object.keys(definition.layers).length > 0 ? definition.layers : null,
    constraints: definition?.constraints ?? null,
    contentDefaults: input.contentDefaults,
    canAssist,
    canCode,
    suggestions: buildSuggestions(definition, { canAssist, canCode }),
    expiresInMs: input.expiresInMs,
    ...(input.html !== undefined ? { html: input.html } : {}),
    ...(input.undoable !== undefined ? { undoable: input.undoable } : {}),
    ...(input.turns && input.turns.length > 0 ? { turns: input.turns } : {}),
    ...(input.rehydrated ? { rehydrated: true } : {}),
  };
}
