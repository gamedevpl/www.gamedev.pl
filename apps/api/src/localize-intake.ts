// Localization at intake — the only place this codebase is allowed to translate.
//
// The rule, and the reason it has its own module rather than living inline at each call
// site: a translation belongs on the write that first stores a piece of text, never on
// the read that serves it. Reads here are polled every 3s by every watcher of a build, so
// a model call on a read costs one request per poll per viewer, and a failed one caches
// nothing and is retried by the very next poll. That is not hypothetical — it produced
// ~9,250 billed-and-discarded Vertex calls in a day on 2026-08-04.
//
// Everything below follows from that:
//
//   - Called once per stored item, never retried. If it fails the text stays in its
//     original language permanently, which is the correct outcome; a later read must not
//     try again.
//   - Decorative. Any failure returns null and the caller stores the source text. A build
//     must never fail, and an agent must never be blocked, because a sentence could not
//     be translated.
//   - Normalizes in both directions. `text` is documented as English and frequently is
//     not — an agent talking to a Polish creator writes Polish, one talking to neither
//     writes something else again — so intake decides what English *is* rather than
//     assuming the input already was. An en→en or pl→pl round trip is a normal outcome,
//     not a wasted call.
import { sanitizeCreatorText } from './submission-status.js';
import { SECONDARY_LOCALE, type TranslationKind, type Translator } from './translate.js';

export interface IntakeLocalizationOptions {
  /**
   * `log` compresses to one short line — right for a progress sentence, wrong for
   * anything the creator wrote. `message` preserves every point and line break: a
   * relayed change request is shown back to the person who asked for it, and a
   * translation that drops their third numbered item is worse than no translation.
   */
  kind: TranslationKind;
  /** Hard cap on the stored translation, matching the cap on the source field. */
  maxLength: number;
}

/** What to store: English as the universal fallback, plus the secondary language. */
export interface IntakeText {
  /** Goes in `text`. English whenever we could produce it, else the source unchanged. */
  text: string;
  /**
   * Goes in `textLocalized` + `locale`. Absent only when normalization produced nothing —
   * not conditioned on who the creator is, so a reader in either language always has a
   * version to match.
   */
  textLocalized?: string;
  locale?: string;
}

/**
 * Normalize one piece of text into **both** stored languages, whatever it arrived in.
 *
 * Deliberately does not take the creator's locale. Two separate failures made that
 * argument the wrong thing to branch on:
 *
 *   - Nothing enforces what language an agent writes in. `text` is documented as English
 *     and often is not, so even for an English-reading creator the question is "is what
 *     we are about to store actually English", not "does this need translating".
 *   - The record's locale is routinely wrong. A game created over MCP has no
 *     `accept-language` to fall back on, so it lands on `en` unless the agent passed one;
 *     eight consecutive self-build games did not. Branching on it meant a Polish creator
 *     watching a Polish build read English all the way through.
 *
 * Storing both makes the record's locale irrelevant to display: the status page matches
 * the reader's own UI language and always finds one of the two. It costs the same single
 * call either way, because the model returns both halves at once.
 *
 * Fail-open in the strong sense: if normalization produces nothing, the caller stores
 * exactly what arrived, and no reader ever retries it.
 */
export async function normalizeAtIntake(
  translator: Translator,
  text: string,
  options: IntakeLocalizationOptions,
): Promise<IntakeText> {
  const source = text.trim();
  if (!source) return { text };

  const clean = (value: string) =>
    sanitizeCreatorText(value, { singleLine: options.kind === 'log' }).slice(0, options.maxLength);

  try {
    const both = await translator.toBilingual(source, SECONDARY_LOCALE, { kind: options.kind });
    if (!both) return { text };
    const en = clean(both.en) || text;
    const localized = clean(both.localized);
    // Equal halves are normal — a short source already in one language often renders the
    // same both ways. Store the pair anyway: the reader match is on `locale`, and a
    // missing half sends that reader to the English fallback instead.
    return localized ? { text: en, textLocalized: localized, locale: SECONDARY_LOCALE } : { text: en };
  } catch {
    return { text };
  }
}
