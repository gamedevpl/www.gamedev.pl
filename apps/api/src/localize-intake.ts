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
//   - Returns null for "no translation" rather than echoing the input, so a caller cannot
//     accidentally tag English text with a Polish locale.
import { sanitizeCreatorText } from './submission-status.js';
import { normalizeLocale, type TranslationKind, type Translator } from './translate.js';

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

/**
 * Translate one piece of text into the creator's language, or answer null.
 *
 * `recordLocale` is the creator's language from the submission record. Anything that
 * normalizes to `en` — including an unknown tag — skips the call entirely.
 */
export async function localizeAtIntake(
  translator: Translator,
  text: string,
  recordLocale: string | undefined,
  options: IntakeLocalizationOptions,
): Promise<{ textLocalized: string; locale: string } | null> {
  const locale = normalizeLocale(recordLocale);
  if (locale === 'en' || !text.trim()) return null;
  try {
    const [translated] = await translator.translate([text], locale, { kind: options.kind });
    const clean = translated
      ? sanitizeCreatorText(translated, { singleLine: options.kind === 'log' }).slice(0, options.maxLength)
      : '';
    // Translators fail open by returning the source unchanged, and NoopTranslator always
    // does. Storing that would tag the source language as the target one and stop the
    // reader ever seeing a real translation, so unchanged counts as no translation.
    return clean && clean !== text ? { textLocalized: clean, locale } : null;
  } catch {
    return null;
  }
}
