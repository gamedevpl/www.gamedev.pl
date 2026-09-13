import { randomUUID } from 'node:crypto';
import type { Store } from '../platform/store.js';
import { isActiveBuildRound } from './job-state.js';

export async function withImprovementAdmission<T>(
  store: Store,
  slug: string,
  now: () => number,
  action: (nonce: string) => Promise<T>,
): Promise<T> {
  const nonce = randomUUID();
  if (!(await store.beginCheckoutRecovery(slug, nonce, now()))) {
    throw Object.assign(new Error('A round is already opening for this game. Refresh before continuing.'), {
      statusCode: 409,
    });
  }
  try {
    const holder = (await store.listSubmissionsBySlug(slug)).find((record) => !record.abandonedAt);
    if (holder && isActiveBuildRound(holder)) {
      throw Object.assign(new Error('This game already has an active round. Continue that round instead.'), {
        statusCode: 409,
      });
    }
    return await action(nonce);
  } finally {
    await store.finishCheckoutRecovery(slug, nonce);
  }
}

export async function abandonImprovement(store: Store, jobId: number, now: () => number): Promise<void> {
  const at = new Date(now()).toISOString();
  await store.recordJobTransition(jobId, {
    to: 'abandoned',
    at,
    by: 'reconciler',
    reason: 'improvement_not_dispatched',
  });
  await store.setSubmissionAbandoned(jobId, at);
}
