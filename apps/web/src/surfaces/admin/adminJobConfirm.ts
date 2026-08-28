import type { JobQueueEntry } from './adminJobsApi.js';

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
