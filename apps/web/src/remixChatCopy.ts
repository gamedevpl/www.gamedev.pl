import type { Locale } from '@gamedevpl/contract';

/**
 * Which summary language to show in the remix transcript.
 *
 * UI locale is the default, but a Polish utterance on an English UI (common)
 * should still surface `summary.pl` when the model wrote one — otherwise the
 * chat reads as English answering Polish.
 */

/** Fold Polish letters so "mozesz" matches "możesz". */
function foldPl(text: string): string {
  return text
    .toLowerCase()
    .replace(/ą/g, 'a')
    .replace(/ć/g, 'c')
    .replace(/ę/g, 'e')
    .replace(/ł/g, 'l')
    .replace(/ń/g, 'n')
    .replace(/ó/g, 'o')
    .replace(/ś/g, 's')
    .replace(/ź/g, 'z')
    .replace(/ż/g, 'z');
}

/**
 * Common Polish words that often appear without diacritics in chat.
 * Kept short on purpose — a hit is a signal, not a language model.
 */
const PL_WORD =
  /\b(nie|jest|czy|jak|ale|oraz|bardzo|prosze|dziekuje|dodaj|zrob|zrobic|zmien|usun|niech|zeby|zebym|chce|chcial|chcialbym|moge|mozesz|tez|juz|teraz|troche|bardziej|mniej|gre|gry|pies|psa|ludzik|samochod|samochody|ciezarowki|wlosy|oczy|szybciej|wolniej|wiekszy|mniejszy)\b/;

export function summaryLangFor(utterance: string, uiLanguage: string | undefined): Locale {
  if (/[ąćęłńóśźżĄĆĘŁŃÓŚŹŻ]/.test(utterance)) return 'pl';
  if (PL_WORD.test(foldPl(utterance))) return 'pl';
  return uiLanguage?.startsWith('pl') ? 'pl' : 'en';
}

/** Pick the player-facing line from a bilingual model summary. */
export function ingestRemixSummary(
  summary: { en?: string; pl?: string } | undefined,
  utterance: string,
  uiLanguage: string | undefined,
  fallback: string,
): string {
  const lang = summaryLangFor(utterance, uiLanguage);
  const preferred = (lang === 'pl' ? summary?.pl : summary?.en)?.trim();
  if (preferred) return preferred;
  const other = (lang === 'pl' ? summary?.en : summary?.pl)?.trim();
  if (other) return other;
  return fallback;
}
