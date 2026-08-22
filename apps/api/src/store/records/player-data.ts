import { MAX_GAME_SAVE_BYTES } from '@gamedevpl/contract';

/**
 * One player's saved progress in one game (docs/persistent-world-plan.md P1).
 *
 * Stored at `users/{uid}/gameSaves/{slug}` — under the *player*, not under the game,
 * and that is a deliberate correction rather than a coin flip. Votes live at
 * `games/{slug}/votes/{uid}` with the uid as a document id, which is why erasing one
 * person's votes needs a walk across every game in the catalog (see
 * `erase-player-signals.ts` for the long version). Saves are the same shape of data —
 * per-player, per-game, erasable on request — so putting them under the uid makes
 * "delete everything this person has" a single subcollection read instead of a walk
 * that grows with the catalog.
 *
 * `data` is an **opaque JSON string**, never a parsed object, for three reasons that
 * each bite on their own: Firestore rejects nested arrays outright (a game saving a 2D
 * grid is not exotic), it strips `undefined`, and it constrains field names — none of
 * which a game author can be expected to know or a validator can usefully enforce on a
 * blob whose shape is the game's business. Storing the string also makes the size cap
 * exact, since the thing measured is the thing stored.
 */
export interface GameSaveRecord {
  slug: string;
  /** Opaque game-authored JSON, capped at MAX_GAME_SAVE_BYTES. Never parsed here. */
  data: string;
  /** The save-format version the game stamped, so it can migrate its own old saves. */
  version: number;
  updatedAt: string;
}

/**
 * A creator's private editor draft for one of their games (EditorKit's draft
 * tier). Unlike a save this content is *validated* before it lands here —
 * against the game's own EDITOR.json declaration, plus moderation on declared
 * text — but it is stored as the serialized string so the size cap measures the
 * thing stored, same reasoning as GameSaveRecord.
 *
 * One mutable document per (creator, game): drafts absorb the iteration and
 * publishing promotes them into an immutable games-store version, which is
 * where history lives. `revision` is a monotonic counter for last-write-wins
 * detection across two open Studio tabs — the write path refuses a stale base
 * revision so the second tab warns instead of silently clobbering.
 */
export interface EditorDraftRecord {
  slug: string;
  /** Serialized content document ({ collection: items[] }), schema-validated on write. */
  content: string;
  revision: number;
  updatedAt: string;
}

/**
 * Ceiling on one editor draft, in bytes of UTF-8 — matches the games repo's
 * MAX_EDITOR_JSON_BYTES (the declaration file carries the same content as its
 * defaults, so the two caps describe the same object).
 */
export const MAX_EDITOR_DRAFT_BYTES = 64 * 1024;

/**
 * One signed-in player's engagement with one published game — the personal half of
 * home-page recommendations.
 *
 * Stored at `users/{uid}/playAffinity/{slug}`, under the player like saves (and unlike
 * votes), so account erasure is one subcollection delete. This is **not** play
 * telemetry: the anonymous `playEvents` stream stays unattributed. Affinity is an
 * account feature the privacy notice discloses, written only when a signed-in (non-bot)
 * player opens a published game through the shell.
 */
export interface PlayAffinityRecord {
  slug: string;
  openCount: number;
  lastPlayedAt: string;
}

/** Soft ceiling so a single account cannot grow an unbounded affinity map. */
export const MAX_PLAY_AFFINITY_GAMES = 100;

/** Caps how high `openCount` can climb — enough for ranking weight, not a scoreboard. */
export const MAX_PLAY_AFFINITY_OPENS = 1_000;

/**
 * Ceiling on one save, in bytes of UTF-8. Mirrored by `MAX_SAVE_BYTES` in the games
 * repo's `shared/modules/save.ts`, which refuses an oversized value in the author's
 * console rather than letting it fail as a 413 in front of a player.
 *
 * 32 KB is far below Firestore's ~1 MiB document limit, and that headroom is the point:
 * this is a budget for level numbers, unlocks and high scores. A game that needs more
 * is describing a world, which is P2's problem and wants a different schema.
 */
export { MAX_GAME_SAVE_BYTES };

/**
 * One document in a game's shared world (docs/persistent-world-plan.md, phase P2).
 *
 * Unlike a save, `fields` IS a parsed object rather than an opaque blob — and that
 * inversion is deliberate. A save's shape is the game's private business; a world entry
 * is read by every other player, so its shape is declared in GAME.json and validated
 * field by field before it ever reaches here (see world-schema.ts). Only values that
 * survived that validation are stored, which is also why Firestore's constraints are
 * not a problem: the declared types are scalars, so there are no nested arrays and no
 * `undefined` to strip.
 *
 * `ownerUid` never leaves the server. Games see `worldOwnerTag(...)`, a per-world hash,
 * so an entry can be attributed to "the same stranger" without naming anybody.
 */
export interface WorldEntryRecord {
  key: string;
  fields: Record<string, string | number | boolean>;
  ownerUid: string;
  createdAt: string;
  updatedAt: string;
}
