import {
  CATEGORY_TERMS,
  MAX_URLS_IN_TEXT,
  PII_PATTERNS,
  URL_PATTERN,
  type RejectCategory,
} from './moderation-terms.js';

export type { RejectCategory } from './moderation-terms.js';

export interface ModerationVerdict {
  allowed: boolean;
  category?: RejectCategory;
}

// Fast feedback for good-faith users + blocking the egregious — not a defense against
// a determined adult. Layer 1 of docs/content-safety-plan.md; L2 (agent refusal) and
// L4 (human merge) are what actually holds the line.
const LEET_MAP: Record<string, string> = {
  '0': 'o',
  '1': 'i',
  '3': 'e',
  '4': 'a',
  '5': 's',
  '7': 't',
  '@': 'a',
  $: 's',
};

function normalizeForMatching(text: string): string {
  const lower = text.toLowerCase();
  const deLeeted = lower.replace(/[013457@$]/g, (ch) => LEET_MAP[ch] ?? ch);
  // Collapse runs of 3+ identical letters down to one (e.g. "shiiiit" -> "shit") so
  // repeated-char evasion doesn't dodge the match below. A run of exactly 2 (most
  // real double letters, e.g. "shooting") is left untouched — 3+ in a row is rare
  // enough in real words that the false-positive risk is acceptable for a v1 filter.
  return deLeeted.replace(/(\p{L})\1{2,}/gu, '$1');
}

const compiledCategoryPatterns = CATEGORY_TERMS.map(({ category, en, pl }) => ({
  category,
  pattern: new RegExp(`\\b(${[...en, ...pl].join('|')})`, 'iu'),
}));

function matchCategory(normalizedText: string): RejectCategory | null {
  for (const { category, pattern } of compiledCategoryPatterns) {
    if (pattern.test(normalizedText)) return category;
  }
  return null;
}

// PII patterns run against the RAW text — leet-substitution would corrupt real
// digits (emails/phone numbers), so normalization must not run before this check.
function containsPii(rawText: string): boolean {
  return PII_PATTERNS.some((pattern) => pattern.test(rawText));
}

function hasTooManyUrls(rawText: string): boolean {
  const matches = rawText.match(URL_PATTERN);
  return (matches?.length ?? 0) > MAX_URLS_IN_TEXT;
}

export function moderateText(rawText: string): ModerationVerdict {
  if (containsPii(rawText)) {
    return { allowed: false, category: 'pii' };
  }
  if (hasTooManyUrls(rawText)) {
    return { allowed: false, category: 'other' };
  }

  const normalized = normalizeForMatching(rawText);
  const category = matchCategory(normalized);
  if (category) {
    return { allowed: false, category };
  }

  return { allowed: true };
}

// Combine multiple fields (e.g. title + concept) into one verdict — reject on the
// first field that trips, so the client gets one clear category, not a merged mess.
export function moderateFields(fields: string[]): ModerationVerdict {
  for (const field of fields) {
    const verdict = moderateText(field);
    if (!verdict.allowed) return verdict;
  }
  return { allowed: true };
}
