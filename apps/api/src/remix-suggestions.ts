import { type EditorDefinition } from './editor-contract.js';

/**
 * Three things worth saying, for this game.
 *
 * An empty field on a phone, over a paused game, is a small act of courage —
 * and it is where most people close the panel. Examples answer "what do I even
 * say", and they teach the register at the same time: short, concrete, in the
 * player's own words rather than the vocabulary of a settings screen.
 *
 * Two rules shape what may appear here.
 *
 * **Derived, never invented.** A suggestion the game cannot act on is worse than
 * no suggestion: it is a promise the next screen breaks. So a parameter line
 * exists only because the game declared that parameter, and the generic starters
 * exist only when a rebuild is actually available to satisfy them.
 *
 * **Structured, not written.** These travel as intent — which parameter, which
 * direction — and the client writes the sentence from the game's own labels in
 * the player's language. Composing English here would ship a panel that speaks
 * Polish everywhere except the one place a player is about to imitate.
 */
export type RemixSuggestion =
  | { kind: 'param'; key: string; direction: 'more' | 'less' | 'on' | 'off' }
  | { kind: 'starter'; id: 'faster' | 'look' | 'harder' };

export const MAX_SUGGESTIONS = 3;

/** The starters, in the order they are offered. Each needs a rebuild to satisfy. */
const STARTERS = ['faster', 'look', 'harder'] as const;

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
    for (const id of STARTERS) {
      if (out.length >= MAX_SUGGESTIONS) break;
      out.push({ kind: 'starter', id });
    }
  }

  return out.slice(0, MAX_SUGGESTIONS);
}
