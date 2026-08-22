import { REMIX_SUGGESTION_STARTERS, type RemixSuggestion } from '@gamedevpl/contract';
import { type EditorDefinition } from './editor-contract.js';

export type { RemixSuggestion };

export const MAX_SUGGESTIONS = 3;

export function buildSuggestions(
  definition: EditorDefinition | null,
  lanes: { canAssist: boolean; canCode: boolean },
): RemixSuggestion[] {
  const out: RemixSuggestion[] = [];

  if (lanes.canAssist && definition?.params) {
    for (const [key, spec] of Object.entries(definition.params)) {
      if (out.length >= MAX_SUGGESTIONS) break;
      if (spec.type === 'number' || spec.type === 'int') {
        // "More" rather than "less": a player opening a remix is looking for the
        // dial turned up, and a game's own defaults are usually its floor.
        out.push({ key, kind: 'param', direction: 'more' });
      } else if (spec.type === 'bool') {
        // Toward the change, whichever way that is — offering the state it is
        // already in reads as a suggestion that does nothing.
        //
        // Against the declaration's default, which is all this side knows: the
        // player's live values never reach this server, and a shared link can
        // arrive with the toggle already flipped. The client corrects the
        // direction against what the game is actually doing before rendering it.
        out.push({ key, kind: 'param', direction: spec.default === true ? 'off' : 'on' });
      }
      // Text and enum are deliberately absent: a useful line for either would
      // have to name a value, and guessing one is how a suggestion becomes a
      // promise the game cannot keep.
    }
  }

  if (lanes.canCode) {
    for (const id of REMIX_SUGGESTION_STARTERS) {
      if (out.length >= MAX_SUGGESTIONS) break;
      out.push({ kind: 'starter', id });
    }
  }

  return out.slice(0, MAX_SUGGESTIONS);
}
