/**
 * A change request from the creator, queued for the agent to collect over the build
 * channel (docs/agent-live-channel-plan.md §4). The PR comment remains the durable
 * record and the thing that *wakes* a stopped agent; this queue is the fast path for
 * one that is already working.
 */
export interface CreatorMessage {
  id: string;
  text: string;
  createdAt: string;
  /** Set once an agent has collected it. Undelivered messages are re-served. */
  deliveredAt?: string | null;
  // 'agent': relayed on the creator's behalf — the only kind ever translated.

  // 'studio': the mini chat agent's own reply — pre-delivered, never queued.

  // 'studio_ack': the same agent's build ack — displays identically to 'studio'.

  // Absent: the creator's own words, typed in the composer.
  origin?: CreatorMessageOrigin;
  /**
   * The relayed text in the creator's language, filled in on the write (see
   * localize-intake.ts). Only ever set for `origin: 'agent'` — a creator's own words are
   * already in the language they chose, and running them through a translator would hand
   * them back a paraphrase of their own request.
   *
   * Absent means the status page shows `text` as written. That is the fail-open outcome
   * when translation was unavailable, and it is never retried by a reader: the whole
   * point of doing this on the write is that a read costs nothing.
   */
  textLocalized?: string;
  /** Which language `textLocalized` is in. Without it the field cannot be matched. */
  locale?: string;
}

/** @see CreatorMessage.origin */
export type CreatorMessageOrigin = 'creator' | 'agent' | 'studio' | 'studio_ack';

// Both never reach a builder and both render as the studio voice — see below.
export function isStudioOrigin(origin: CreatorMessageOrigin | undefined): boolean {
  return origin === 'studio' || origin === 'studio_ack';
}

/**
 * A screenshot the agent pushed over the build channel rather than committing.
 *
 * Committed media only exists once the agent has run capture and pushed, which is
 * late in a build; this is the path that can put a picture on the creator's screen
 * in the first minutes. Bytes live here as base64 because a pixel-art PNG at these
 * sizes is tens of kilobytes — comfortably inside a Firestore document, and not
 * worth a bucket, its IAM, and a retention job.
 */
export interface BuildShot {
  id: string;
  /** base64-encoded PNG. */
  data: string;
  /** Agent-authored caption in English, already sanitized. */
  label?: string;
  /** The same caption in `locale`, authored rather than machine translated. */
  labelLocalized?: string;
  locale?: string;
  createdAt: string;
}

/** A shot without its bytes — what a listing needs. */
export type BuildShotSummary = Omit<BuildShot, 'data'>;

/**
 * A playable build of the game as it stood at some moment, pushed before any commit.
 *
 * A screenshot answers "what does it look like"; this answers "does it play", which is
 * the only question a creator can really judge a game by. It is the same self-contained
 * offline HTML the site serves for a published game — one file, no assets, capped by the
 * games repo's own bundle budget — so whatever plays a published game plays this.
 *
 * Bytes live here as base64 for the same reason shots do: an assembled bundle is a couple
 * of hundred kilobytes, which sits inside a Firestore document with room to spare, and a
 * preview that is obsolete within minutes is not worth a bucket and a retention job.
 *
 * This is unreviewed agent output. It has passed a build and a smoke run and nothing
 * else — no gate, no review, no merge. Whatever serves it must treat it as hostile.
 */
// Mirrors `BuildPlayableOrigin`; absent means the agent pushed the bytes.
export type BuildPreviewOrigin = 'seed' | 'staged' | 'candidate';

export interface BuildPreview {
  id: string;
  /** base64-encoded self-contained HTML document. */
  data: string;
  /** The game's slug, for a title the creator recognizes. */
  slug?: string;
  /** Agent-authored caption in English, already sanitized. */
  label?: string;
  /** The same caption in `locale`, authored rather than machine translated. */
  labelLocalized?: string;
  locale?: string;
  // A provisional origin must never be announced as a ready draft.
  origin?: BuildPreviewOrigin;
  createdAt: string;
}

/** A preview without its bytes — what a listing needs. */
export type BuildPreviewSummary = Omit<BuildPreview, 'data'>;
