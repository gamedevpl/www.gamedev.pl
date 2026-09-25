import { MAX_TITLE_LENGTH } from '@gamedevpl/contract';
import { sanitizeCreatorText } from '../platform/submission-status.js';

const MIN_TITLE_LENGTH = 3;

export function cleanSuggestedTitle(raw: string | undefined): string | undefined {
  if (!raw) return undefined;
  const cleaned = sanitizeCreatorText(raw, { singleLine: true })
    .replace(/^["'“”„«»]+|["'“”„«»]+$/g, '')
    .replace(/[.!?,;:]+$/, '')
    .trim()
    .slice(0, MAX_TITLE_LENGTH)
    .trim();
  return cleaned.length >= MIN_TITLE_LENGTH ? cleaned : undefined;
}
