import type { CatalogTouch } from '@gamedevpl/contract';

/**
 * How a game can be played with a thumb (and with mouse / touchpad via the same path).
 *
 * Mirrors www.gamedev.pl-games `tools/lib/touch.ts` `classifyTouchSource` — kept here so
 * the snapshot bake can derive a website-ready catalog from a games-repo archive without
 * reading a committed `catalog.json` (or re-implementing a second, drifting classifier).
 *
 * - `gamekit` — reads input through `GameKit.createInput` / `defineGame`
 * - `native` — opted out of the overlay and handles pointer polls itself
 * - `controllers` — party game; phones are the controllers
 * - `none` — keyboard-only
 */
export type CatalogGameTouch = CatalogTouch;

const OPTS_OUT = /touch\s*:\s*false/;
const USES_GAMEKIT_INPUT = /createInput\s*\(|\bdefineGame\b/;
const USES_PARTY = /\bcreateParty\s*\(/;
const HANDLES_POINTERS =
  /consumeClick\s*\(|consumePress\s*\(|consumeRelease\s*\(|consumePinch\s*\(|\.position\s*\(|\.held\s*\(|pointerdown|pointermove|pointerup|touchstart|\.pointer\s*\(/;

/** Classifies a game's concatenated TypeScript. Pure so it is directly testable. */
export function classifyTouchSource(code: string): CatalogGameTouch {
  if (USES_PARTY.test(code)) return 'controllers';
  if (USES_GAMEKIT_INPUT.test(code) && !OPTS_OUT.test(code)) return 'gamekit';
  if (HANDLES_POINTERS.test(code)) return 'native';
  return 'none';
}
