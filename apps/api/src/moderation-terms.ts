// Deny-pattern data for apps/api/src/moderation.ts. Kept as a plain data file (not
// logic) so updating terms is a content change, not a code change. Patterns are
// matched against normalized text (lowercased, leet-substituted, repeated-char
// collapsed) — see moderation.ts. Word-boundary-ish matching is handled by the
// matcher, not baked into each pattern, to keep this list readable.

export type RejectCategory = 'profanity' | 'adult' | 'violence' | 'pii' | 'injection' | 'other';

interface CategoryTerms {
  category: RejectCategory;
  en: string[];
  pl: string[];
}

// Slurs/hate speech and general profanity share the 'profanity' category — both
// get the same generic "rephrase" feedback (never echo which term tripped it).
export const CATEGORY_TERMS: CategoryTerms[] = [
  {
    category: 'profanity',
    en: [
      'fuck',
      'shit',
      'bitch',
      'asshole',
      'bastard',
      'cunt',
      'nigger',
      'nigga',
      'faggot',
      'retard(ed)?',
      'chink',
      'spic',
      'kike',
      'tranny',
    ],
    pl: [
      'kurwa',
      'chuj',
      'pierdol\\w*',
      'jeban\\w*',
      'skurwysyn\\w*',
      'pizd\\w*',
      'ciota',
      'pedał\\w*',
      'cygan\\w*',
      'zjeban\\w*',
    ],
  },
  {
    category: 'adult',
    en: [
      'porn\\w*',
      'sex(ual)?\\s*content',
      'nude\\w*',
      'naked\\s*(girl|boy|woman|man|child|kid)',
      'hentai',
      'fetish',
      'strip\\s*club',
      'child\\s*porn',
      'lolicon',
      'shotacon',
      'sexualiz\\w*\\s*(child|minor|kid)',
    ],
    pl: ['pornograf\\w*', 'nag\\w*\\s*(dziewczyn|chłopiec|dziecko)', 'erotyk\\w*'],
  },
  {
    category: 'violence',
    en: [
      'gore\\b',
      'graphic\\s*violence',
      'torture\\s*(scene|porn)?',
      'behead\\w*',
      'dismember\\w*',
      'mass\\s*shoot\\w*',
      'terroris\\w*\\s*attack',
      'self[\\s-]*harm',
      'suicide\\s*(method|instructions)',
    ],
    pl: ['okaleczeni\\w*', 'samobój\\w*\\s*(metoda|instrukcj\\w*)', 'masakr\\w*'],
  },
  {
    category: 'injection',
    en: [
      'ignore\\s*(your|all|previous|prior)\\s*instructions',
      'ignore\\s*the\\s*system\\s*prompt',
      'reveal\\s*your\\s*(system\\s*)?prompt',
      'act\\s*as\\s*(if\\s*you|an?)\\s*(unrestricted|jailbroken|dan)',
      'modify\\s*the\\s*(ci|workflow|pipeline|deploy\\w*)',
      'exfiltrat\\w*',
      'disable\\s*(safety|moderation|content\\s*filter)',
      'you\\s*are\\s*now\\s*(dan|jailbroken)',
    ],
    pl: ['zignoruj\\s*(twoje|wszystkie|poprzednie)\\s*instrukcj\\w*', 'ujawnij\\s*(swój\\s*)?prompt'],
  },
];

// PII patterns don't need en/pl split — email/phone/address shapes are language-agnostic.
export const PII_PATTERNS: RegExp[] = [
  /[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/i, // email
  // Phone-ish digit run, anchored so it cannot fire inside a longer alphanumeric token.
  //
  // Without the boundaries this matched the digits buried in our own identifiers: a
  // creator asking to "show the screenshot from delivery v20260806T005029733Z-38da4c"
  // was refused as PII (owner, 2026-08-06), and engine SHAs like
  // 648092d7e36bc302d981e58c842829b6b4b8029f matched the same way. A phone number is
  // not glued to letters; a version id always is.
  //
  // The extension suffix is matched rather than merely tolerated. A bare trailing
  // boundary rejected 555-123-4567x89 outright — the compact form people actually
  // write — so an x/ext tail is now part of the number. That keeps the boundary
  // meaningful: the only letters allowed to follow are the ones that mean "extension",
  // which is what separates a phone from an identifier rather than "any letter at all"
  // (Codex, #626).
  /(?<![A-Za-z0-9])(\+?\d{1,3}[\s.-]?)?(\(?\d{2,4}\)?[\s.-]?){2,4}\d{2,4}(?:\s?(?:x|ext\.?)\s?\d{1,5})?(?![A-Za-z0-9])/i,
  /\b\d{1,5}\s+[a-ząćęłńóśźż]+\s+(street|st\.|avenue|ave\.|road|rd\.|ulica|ul\.)\b/i, // street address
];

// Cap on outbound links in a submission — specs shouldn't link out.
export const MAX_URLS_IN_TEXT = 2;
export const URL_PATTERN = /https?:\/\/\S+/gi;
