/**
 * Which summary language to show in the remix transcript.
 *
 * UI locale is the default, but a Polish utterance on an English UI (common)
 * should still surface `summary.pl` when the model wrote one — otherwise the
 * chat reads as English answering Polish.
 */
export function summaryLangFor(utterance: string, uiLanguage: string | undefined): 'en' | 'pl' {
  if (/[ąćęłńóśźżĄĆĘŁŃÓŚŹŻ]/.test(utterance)) return 'pl';
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
