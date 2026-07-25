/**
 * Legal documents as data rather than JSX or markdown.
 *
 * The point is reviewability: a lawyer has to be able to read, edit and compare the
 * Polish and English texts without touching React, and the two languages have to be
 * diffable section by section. Keeping them as structured content also keeps ~1,000
 * lines of prose out of the i18n JSON, whose parity test would otherwise be the only
 * thing standing between us and a half-translated privacy policy.
 */

export type LegalDocId = 'privacy' | 'terms';

/** Supported inline markup: `[label](href)` links. Nothing else — see renderInline. */
export type LegalBlock =
  | { kind: 'p'; text: string }
  | { kind: 'ul'; items: string[] }
  /** Used for the processing register, where a table is genuinely the clearest form. */
  | { kind: 'table'; head: string[]; rows: string[][] };

export type LegalSection = {
  /** Stable anchor, identical across languages, so `/privacy#rights` can be cited. */
  id: string;
  heading: string;
  blocks: LegalBlock[];
};

export type LegalDocument = {
  id: LegalDocId;
  title: string;
  /** ISO date the text took effect. */
  effectiveDate: string;
  /** One or two sentences shown above the table of contents. */
  intro: string;
  sections: LegalSection[];
};
