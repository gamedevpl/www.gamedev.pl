import type { SubmissionRecord } from '../platform/store.js';
import { closedInfo, roundClosedFields } from '../platform/round-closed.js';

// The creator's language first, English once as the fallback.
export function briefLocales(locale: string | undefined): string[] {
  return locale && locale !== 'en' ? [locale, 'en'] : ['en'];
}

// A receipt-only key's round closed; the record says why.
export function receiptClosedFields(record: SubmissionRecord): Record<string, unknown> {
  const closed = record.roundClosed;
  return closed ? roundClosedFields({ closed: closedInfo(closed.generation, record) }) : {};
}

export const SESSION_EXPIRES_AT_PROP = {
  type: 'number',
  description:
    'Unix seconds when the sessionKey expires. Not the round lifetime: a round closes earlier on a green ' +
    'publish, a creator action, a builder handoff or days without activity. A refusal with ' +
    'code=round_closed names that cause in reason.',
} as const;
