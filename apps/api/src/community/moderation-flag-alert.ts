import type { FastifyRequest } from 'fastify';
import type { ModerationFlag } from '../store/records/moderation-flag.js';

export async function notifyModerationFlag(
  notify: ((event: { flagId: string; slug: string; reason: string }) => Promise<void>) | undefined,
  log: FastifyRequest['log'],
  flag: ModerationFlag,
  reopened: boolean,
): Promise<void> {
  try {
    const flagId = reopened ? `${flag.id}@${flag.createdAt}` : flag.id;
    await notify?.({ flagId, slug: flag.slug, reason: flag.reason });
  } catch (err) {
    log.error({ err, slug: flag.slug }, 'could not notify operators of a game report');
  }
}
