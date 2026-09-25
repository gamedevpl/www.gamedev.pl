import type { EditorialCounts, JobQueueEntry, PublishRefusal } from './adminJobsApi.js';

export function publishConfirmCopy(jobs: JobQueueEntry[]): { title: string; body: string; confirmLabel: string } {
  if (jobs.length === 1) {
    const job = jobs[0];
    return {
      title: `Publish ${job.title}?`,
      body: job.slug ? `This goes live on the catalog as ${job.slug}.` : 'This goes live on the catalog.',
      confirmLabel: 'Publish',
    };
  }
  return {
    title: `Publish ${jobs.length} games?`,
    body: 'Each ready build goes live on the catalog.',
    confirmLabel: `Publish ${jobs.length}`,
  };
}

export function cancelConfirmCopy(jobs: JobQueueEntry[]): { title: string; body: string; confirmLabel: string } {
  if (jobs.length === 1) {
    const job = jobs[0];
    return {
      title: `Cancel ${job.title}?`,
      body: 'The build stops and cannot be undone.',
      confirmLabel: 'Cancel build',
    };
  }
  return {
    title: `Cancel ${jobs.length} jobs?`,
    body: 'Those builds stop and cannot be undone.',
    confirmLabel: `Cancel ${jobs.length}`,
  };
}

export type EditorialRefusal = 'editorial_cut' | 'editorial_pending';

export function isEditorialRefusal(code: PublishRefusal): code is EditorialRefusal {
  return code === 'editorial_cut' || code === 'editorial_pending';
}

export function formatEditorialCounts(counts?: EditorialCounts): string {
  const reviewers = counts?.reviewers ?? 0;
  const keep = counts?.keep ?? 0;
  const cut = counts?.cut ?? 0;
  const skip = counts?.skip ?? 0;
  const weak = Object.entries(counts?.weakOrBad ?? {}).filter(([, n]) => n > 0);
  const facets = weak.length > 0 ? `; weak/bad ${weak.map(([facet, n]) => `${facet}×${n}`).join(', ')}` : '';
  return `${reviewers} reviewers, ${keep} keep, ${cut} cut, ${skip} skip${facets}`;
}

export function publishRefusalCopy(code: PublishRefusal, counts?: EditorialCounts): string {
  const known: Record<PublishRefusal, string> = {
    gate_red: 'the gate failed this version — read its report before publishing',
    not_gated: 'the gate has not run against this version yet',
    nothing_delivered: 'this build has never delivered a version',
    profile_required: 'the creator has not claimed a public profile — ask them to open Studio and use Claim handle',
    preview_superseded_delivery:
      'a newer preview replaced the delivered version — wait for it to be sealed, then preview again',
    store_unavailable: 'the games store is not configured on this deployment',
    editorial_cut: `reviewers cut this game (${formatEditorialCounts(counts)})`,
    editorial_pending: `no reviewer has cleared this game yet (${formatEditorialCounts(counts)})`,
    reason_required: 'an override needs a written reason',
    reason_too_long: 'the override reason is too long',
    unknown: 'refused, and the reason was not one this console knows',
  };
  return known[code];
}

export function editorialOverrideCopy(
  code: EditorialRefusal,
  counts?: EditorialCounts,
): { title: string; body: string; confirmLabel: string; danger: boolean } {
  const tally = formatEditorialCounts(counts);
  if (code === 'editorial_cut') {
    return {
      title: 'Override a cut consensus?',
      body: `Reviewers judged this game a cut (${tally}). Publishing anyway needs a written reason.`,
      confirmLabel: 'Override and publish',
      danger: true,
    };
  }
  return {
    title: 'Publish with no reviewer keep?',
    body: `Nobody has cleared this game yet (${tally}). Publishing anyway needs a written reason.`,
    confirmLabel: 'Override and publish',
    danger: false,
  };
}
