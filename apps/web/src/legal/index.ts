import type { Locale } from '@gamedevpl/contract';
import { privacyEn } from './privacy.en.js';
import { privacyPl } from './privacy.pl.js';
import { termsEn } from './terms.en.js';
import { termsPl } from './terms.pl.js';
import type { LegalDocId, LegalDocument } from './types.js';

export type { LegalBlock, LegalDocId, LegalDocument, LegalSection } from './types.js';

const DOCUMENTS: Record<Locale, Record<LegalDocId, LegalDocument>> = {
  en: { privacy: privacyEn, terms: termsEn },
  pl: { privacy: privacyPl, terms: termsPl },
};

/**
 * Polish is the fallback rather than English, and deliberately so: these documents
 * are written under Polish law for a Polish service, the Polish text is the binding
 * one, and someone reading in a third language is better served by the version that
 * actually governs than by a translation of it.
 */
export function legalDocument(doc: LegalDocId, language: string | undefined | null): LegalDocument {
  return DOCUMENTS[language?.toLowerCase().startsWith('en') ? 'en' : 'pl'][doc];
}

export const ALL_LEGAL_DOCUMENTS = DOCUMENTS;
