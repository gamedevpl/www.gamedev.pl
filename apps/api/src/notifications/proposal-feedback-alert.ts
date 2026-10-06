import type { OperatorNotificationType } from '../platform/store.js';
import { createNotification, maybePush, sendOperatorEmail, type EmitDeps } from './notify.js';

// Catalog proposals have no creator; admins are their reviewers.

// Decided in the local ops console, which alerts cannot deep-link.
export const PROPOSAL_FEEDBACK_LINK = '/';

// One id per proposal, so re-reconciles and sweeps never repeat it.
export function proposalFeedbackAlertId(proposalId: string): string {
  return `op-proposal-${proposalId}`;
}

export async function emitProposalFeedbackAlert(
  deps: EmitDeps & { adminUids: Iterable<string> },
  event: { proposalId: string; gameTitle: string },
): Promise<{ created: number }> {
  const createdAt = new Date(deps.now?.() ?? Date.now()).toISOString();
  const type: OperatorNotificationType = 'operator.proposal_feedback';
  const id = proposalFeedbackAlertId(event.proposalId);
  let created = 0;

  for (const uid of deps.adminUids) {
    const result = await createNotification(deps, uid, {
      id,
      type,
      createdAt,
      titleKey: `notifications.${type}.title`,
      bodyKey: `notifications.${type}.body`,
      params: { title: event.gameTitle },
      link: PROPOSAL_FEEDBACK_LINK,
    });
    if (!result.created) continue;
    created += 1;
    await sendOperatorEmail(deps, uid, id, type, PROPOSAL_FEEDBACK_LINK, { title: event.gameTitle });
    await maybePush(deps, uid, result.notification);
  }

  return { created };
}
