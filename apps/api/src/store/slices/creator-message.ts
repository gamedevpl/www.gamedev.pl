import { randomUUID } from 'node:crypto';
import type { CreatorProposal } from '@gamedevpl/contract';
import type { CreatorMessage, CreatorMessageOrigin } from '../records/build-log.js';
import { isStudioOrigin } from '../records/build-log.js';

export type CreatorMessageWrite = {
  origin?: CreatorMessageOrigin;
  delivered?: boolean;
  textLocalized?: string;
  locale?: string;
  proposal?: CreatorProposal;
};

export function newCreatorMessage(text: string, opts?: CreatorMessageWrite): CreatorMessage {
  const now = new Date().toISOString();
  return {
    id: randomUUID(),
    text,
    createdAt: now,
    deliveredAt: opts?.delivered ? now : null,
    ...(opts?.origin === 'agent' || isStudioOrigin(opts?.origin) ? { origin: opts?.origin } : {}),
    ...(opts?.textLocalized && opts?.locale ? { textLocalized: opts.textLocalized, locale: opts.locale } : {}),
    ...(opts?.proposal ? { proposal: opts.proposal } : {}),
  };
}
