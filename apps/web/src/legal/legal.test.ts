import { describe, expect, it } from 'vitest';
import { legalDocument, type LegalDocId, type LegalDocument } from './index.js';
import { CONTACT_EMAIL } from './operator.js';
import { privacyEn } from './privacy.en.js';
import { privacyPl } from './privacy.pl.js';
import { termsEn } from './terms.en.js';
import { termsPl } from './terms.pl.js';

const DOC_IDS = ['privacy', 'terms'] as const;

// Statically imported here (test-only) for cross-language parity checks below —
// legal/index.ts itself loads only the reader's language, on purpose.
const ALL_LEGAL_DOCUMENTS: Record<'en' | 'pl', Record<LegalDocId, LegalDocument>> = {
  en: { privacy: privacyEn, terms: termsEn },
  pl: { privacy: privacyPl, terms: termsPl },
};

/**
 * A legal document that exists in one language but not the other is not a cosmetic
 * bug: it means someone reading in Polish is agreeing to different terms than
 * someone reading in English. Same reasoning as i18n/locales.test.ts.
 */
describe('legal documents', () => {
  for (const id of DOC_IDS) {
    it(`${id}: pl and en have the same sections in the same order`, () => {
      const pl = ALL_LEGAL_DOCUMENTS.pl[id];
      const en = ALL_LEGAL_DOCUMENTS.en[id];
      expect(en.sections.map((s) => s.id)).toEqual(pl.sections.map((s) => s.id));
    });

    it(`${id}: pl and en describe the same content shape`, () => {
      const pl = ALL_LEGAL_DOCUMENTS.pl[id];
      const en = ALL_LEGAL_DOCUMENTS.en[id];
      pl.sections.forEach((plSection, index) => {
        const enSection = en.sections[index]!;
        // Block kinds must line up: a table of processing purposes in one language and
        // a vague paragraph in the other is how a translation quietly loses a disclosure.
        expect(
          enSection.blocks.map((b) => b.kind),
          `${id}/${plSection.id}`,
        ).toEqual(plSection.blocks.map((b) => b.kind));
        plSection.blocks.forEach((plBlock, blockIndex) => {
          const enBlock = enSection.blocks[blockIndex]!;
          if (plBlock.kind === 'ul' && enBlock.kind === 'ul') {
            expect(enBlock.items.length, `${id}/${plSection.id} list`).toBe(plBlock.items.length);
          }
          if (plBlock.kind === 'table' && enBlock.kind === 'table') {
            expect(enBlock.head.length).toBe(plBlock.head.length);
            expect(enBlock.rows.length, `${id}/${plSection.id} table`).toBe(plBlock.rows.length);
            for (const row of [...plBlock.rows, ...enBlock.rows]) {
              expect(row.length).toBe(plBlock.head.length);
            }
          }
        });
      });
    });
  }

  it('has no empty text anywhere', () => {
    for (const language of ['pl', 'en'] as const) {
      for (const id of DOC_IDS) {
        const doc = ALL_LEGAL_DOCUMENTS[language][id];
        expect(doc.title.trim(), `${language}/${id} title`).not.toBe('');
        expect(doc.intro.trim(), `${language}/${id} intro`).not.toBe('');
        for (const section of doc.sections) {
          expect(section.heading.trim(), `${language}/${id}/${section.id}`).not.toBe('');
          expect(section.blocks.length).toBeGreaterThan(0);
          for (const block of section.blocks) {
            if (block.kind === 'p') expect(block.text.trim()).not.toBe('');
            if (block.kind === 'ul') for (const item of block.items) expect(item.trim()).not.toBe('');
            if (block.kind === 'table')
              for (const row of block.rows) for (const cell of row) expect(cell.trim()).not.toBe('');
          }
        }
      }
    }
  });

  // Both laws behind these documents require a reachable contact address, and both
  // documents promise one in several places. Catch a rename that leaves the promise
  // pointing nowhere.
  it('every document publishes the contact address', () => {
    for (const language of ['pl', 'en'] as const) {
      for (const id of DOC_IDS) {
        const doc = ALL_LEGAL_DOCUMENTS[language][id];
        expect(serialize(doc), `${language}/${id}`).toContain(CONTACT_EMAIL);
      }
    }
  });

  it('falls back to the binding Polish text for unknown languages', async () => {
    expect(await legalDocument('terms', 'de')).toBe(ALL_LEGAL_DOCUMENTS.pl.terms);
    expect(await legalDocument('terms', undefined)).toBe(ALL_LEGAL_DOCUMENTS.pl.terms);
    expect(await legalDocument('terms', 'en-US')).toBe(ALL_LEGAL_DOCUMENTS.en.terms);
    expect(await legalDocument('privacy', 'pl-PL')).toBe(ALL_LEGAL_DOCUMENTS.pl.privacy);
  });
});

function serialize(doc: LegalDocument): string {
  return doc.sections
    .flatMap((section) =>
      section.blocks.map((block) =>
        block.kind === 'p' ? block.text : block.kind === 'ul' ? block.items.join(' ') : block.rows.flat().join(' '),
      ),
    )
    .join(' ');
}
