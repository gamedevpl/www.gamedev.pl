// Operator-facing email and push copy, split from email-templates.ts.

import type { EmailMessage } from './mailer.js';
import type { OperatorNotificationType } from '../platform/store.js';
import { escapeHtml } from './email-templates.js';

// English only: one operator mailbox reads these, not the public.

// No unsubscribe: leaving ADMIN_UIDS is how an operator stops these.

export interface OperatorEmailParams {
  // Sanitized game title, or a waitlist applicant's display label.
  title: string;
  // Present for job alerts; absent for waitlist joins.
  jobId?: number;
  // Absolute URL to the console.
  actionUrl: string;
  // Machine-readable extra, rendered verbatim, so keep it ours.
  detail?: string;
  // Waitlist joins: the applicant's verified email, when known.
  email?: string;
}

const operatorCopy: Record<OperatorNotificationType, { subject: string; lead: string; cta: string }> = {
  'operator.review_ready': {
    subject: 'A build is waiting to be published',
    lead: 'passed the gate and is waiting for the publish decision.',
    cta: 'Open the queue',
  },
  'operator.build_failed': {
    subject: 'A build failed',
    lead: 'ended without delivering a game.',
    cta: 'Open the queue',
  },
  'operator.build_stalled': {
    subject: 'A build has stopped moving',
    lead: 'has not moved for longer than its state allows.',
    cta: 'Open the queue',
  },
  'operator.feedback_undelivered': {
    subject: 'A change request is not reaching the agent',
    lead: 'has a creator’s change request that no agent has collected — the relay may be down.',
    cta: 'Open the queue',
  },
  'operator.game_unhealthy': {
    subject: 'A live game failed its health check',
    lead: 'no longer passes the check on the current engine. It still serves — the creator has been nudged to refresh it.',
    cta: 'Open the queue',
  },
  'operator.waitlist_joined': {
    subject: 'Someone joined the beta waitlist',
    lead: 'asked to join the closed beta.',
    cta: 'Open telemetry',
  },
  'operator.review_sweep': {
    subject: 'A review sweep is ready',
    lead: 'has games waiting on the review desk.',
    cta: 'Open the review desk',
  },
  'operator.moderation_flag': {
    subject: 'A reviewer reported a game',
    lead: 'was reported by a reviewer. One report is enough to act on.',
    cta: 'Open the reports queue',
  },
  'operator.proposal_feedback': {
    subject: 'Feedback arrived for a catalog game',
    lead: 'has a player proposal that passed our checks and is waiting to be read.',
    cta: 'Open proposals',
  },
};

export function operatorPushContent(type: OperatorNotificationType, title: string): { title: string; body: string } {
  const copy = operatorCopy[type];
  return { title: copy.subject, body: `“${title}” ${copy.lead}` };
}

export function operatorNotificationMessage(
  to: string,
  type: OperatorNotificationType,
  params: OperatorEmailParams,
): EmailMessage {
  const copy = operatorCopy[type];
  const actionUrl = escapeHtml(params.actionUrl);
  const detail = params.detail ? ` (${params.detail})` : '';
  const emailLine = params.email;
  const jobLine = params.jobId !== undefined ? `Job #${params.jobId}` : undefined;

  const text = [
    `“${params.title}” ${copy.lead}${detail}`,
    ...(emailLine ? ['', emailLine] : []),
    ...(jobLine ? ['', jobLine] : []),
    '',
    `${copy.cta}: ${params.actionUrl}`,
  ].join('\n');

  const html = [
    `<p>“${escapeHtml(params.title)}” ${escapeHtml(copy.lead)}${escapeHtml(detail)}</p>`,
    ...(emailLine ? [`<p style="color:#888;font-size:12px">${escapeHtml(emailLine)}</p>`] : []),
    ...(jobLine ? [`<p style="color:#888;font-size:12px">${escapeHtml(jobLine)}</p>`] : []),
    `<p><a href="${actionUrl}">${escapeHtml(copy.cta)}</a></p>`,
  ].join('\n');

  return { to, subject: `${copy.subject}: ${params.title}`.slice(0, 200), text, html };
}
