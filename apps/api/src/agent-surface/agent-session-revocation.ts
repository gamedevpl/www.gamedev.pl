import { isActiveBuildRound } from '../creation/builder.js';
import type { Store } from '../platform/store.js';

/**
 * Invalidates every outstanding session key for a creator's open self-build rounds.
 *
 * Account-level credentials are only openers. Once an opener has minted a session key,
 * advancing the round generation is the revocation boundary checked by every later MCP
 * tool call. Grants are not persisted on rounds, so this intentionally fails safe across
 * all of the creator's self rounds. Agents on another grant can recover by calling start
 * again. Platform rounds are excluded because account credentials cannot open them.
 */
export async function endOpenAgentSessions(store: Store, ownerUid: string): Promise<number> {
  const owned = await store.listSubmissionsByOwner(ownerUid);
  const open = owned.filter(
    (job) => !job.abandonedAt && isActiveBuildRound(job) && (job.builder ?? 'platform') === 'self',
  );
  let ended = 0;
  for (const job of open) {
    if ((await store.bumpRoundGeneration(job.issueNumber)) !== null) ended += 1;
  }
  return ended;
}
