import { describe, expect, it } from 'vitest';
import { ingestRemixSummary, summaryLangFor } from './remixChatCopy.js';

describe('remix chat copy', () => {
  it('prefers Polish when the utterance has Polish characters, even on an English UI', () => {
    expect(summaryLangFor('zrób większego psa', 'en')).toBe('pl');
    expect(ingestRemixSummary({ en: 'Bigger dog.', pl: 'Większy pies.' }, 'zrób większego psa', 'en', 'Applied.')).toBe(
      'Większy pies.',
    );
  });

  it('follows the UI locale when the utterance is ASCII', () => {
    expect(summaryLangFor('make it bigger', 'pl')).toBe('pl');
    expect(summaryLangFor('make it bigger', 'en')).toBe('en');
  });

  it('falls back to the other language, then the provided fallback', () => {
    expect(ingestRemixSummary({ en: 'Bigger.' }, 'make it bigger', 'pl', 'Zastosowano.')).toBe('Bigger.');
    expect(ingestRemixSummary(undefined, 'make it bigger', 'en', 'Applied.')).toBe('Applied.');
  });
});
