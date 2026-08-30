import type { Locale } from '@gamedevpl/contract';
import type { LegalDocId, LegalDocument } from './types.js';

export type { LegalBlock, LegalDocId, LegalDocument, LegalSection } from './types.js';

/**
 * Polish is the fallback rather than English, and deliberately so: these documents
 * are written under Polish law for a Polish service, the Polish text is the binding
 * one, and someone reading in a third language is better served by the version that
 * actually governs than by a translation of it.
 */
export function resolveLegalLocale(language: string | undefined | null): Locale {
  return language?.toLowerCase().startsWith('en') ? 'en' : 'pl';
}

const LOADERS: Record<Locale, Record<LegalDocId, () => Promise<LegalDocument>>> = {
  en: {
    privacy: () => import('./privacy.en.js').then((m) => m.privacyEn),
    terms: () => import('./terms.en.js').then((m) => m.termsEn),
  },
  pl: {
    privacy: () => import('./privacy.pl.js').then((m) => m.privacyPl),
    terms: () => import('./terms.pl.js').then((m) => m.termsPl),
  },
};

/** Loads only the requested language's document — the other three stay unbundled. */
export function legalDocument(doc: LegalDocId, language: string | undefined | null): Promise<LegalDocument> {
  return LOADERS[resolveLegalLocale(language)][doc]();
}
