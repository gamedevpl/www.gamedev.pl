import { describe, expect, it } from 'vitest';
import en from './i18n/locales/en.json';
import pl from './i18n/locales/pl.json';
import { submissionErrorKey } from './submissionErrors.js';

function resolve(locale: unknown, key: string): unknown {
  return key.split('.').reduce<unknown>((node, part) => (node as Record<string, unknown>)?.[part], locale);
}

describe('submissionErrorKey', () => {
  it('answers an expired session with sign-in guidance, not a retry', () => {
    expect(submissionErrorKey({ status: 401, message: 'authentication required' })).toBe('errors.signInRequired');
  });

  it('keeps the coarse IP limiter distinct from the generic failure', () => {
    expect(submissionErrorKey({ status: 429, message: 'too many submissions, please try again later' })).toBe(
      'errors.tooManyAttempts',
    );
  });

  it('prefers the truer message for the other two refusals that answer 429', () => {
    expect(submissionErrorKey({ status: 429, message: 'daily submission quota exceeded' })).toBe('auth.quotaExceeded');
    expect(submissionErrorKey({ status: 429, message: 'creation_paused' })).toBe('errors.creationPaused');
    expect(submissionErrorKey({ status: 429, message: 'creation_over_capacity' })).toBe('errors.creationOverCapacity');
  });

  it('carries the moderation category through', () => {
    expect(submissionErrorKey({ status: 422, message: 'content_rejected', category: 'sexual' })).toBe(
      'errors.contentRejected.sexual',
    );
    expect(submissionErrorKey({ status: 422, message: 'content_rejected' })).toBe('errors.contentRejected.other');
  });

  it('answers a blocked account from its 403', () => {
    expect(submissionErrorKey({ status: 403, message: 'account is blocked' })).toBe('auth.accountBlocked');
  });

  it('never shows a raw server code', () => {
    expect(submissionErrorKey({ status: 500, message: 'internal' })).toBe('errors.generic');
    expect(submissionErrorKey({ status: 503, message: 'submissions are not configured' })).toBe('errors.generic');
    expect(submissionErrorKey({ message: 'dispatch_failed' })).toBe('errors.generic');
  });

  it('resolves every key it can return in both locales', () => {
    const keys = [
      submissionErrorKey({ status: 401, message: 'authentication required' }),
      submissionErrorKey({ status: 429, message: 'too many submissions, please try again later' }),
      submissionErrorKey({ status: 429, message: 'daily submission quota exceeded' }),
      submissionErrorKey({ status: 429, message: 'creation_paused' }),
      submissionErrorKey({ status: 429, message: 'creation_over_capacity' }),
      submissionErrorKey({ status: 409, message: 'name_unavailable' }),
      submissionErrorKey({ status: 422, message: 'content_rejected', category: 'other' }),
      submissionErrorKey({ status: 403, message: 'account is blocked' }),
      submissionErrorKey({ message: 'dispatch_failed' }),
    ];

    for (const key of keys) {
      expect(typeof resolve(en, key), `en is missing ${key}`).toBe('string');
      expect(typeof resolve(pl, key), `pl is missing ${key}`).toBe('string');
    }
  });
});
