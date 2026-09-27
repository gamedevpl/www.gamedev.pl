import type { SubmissionStore } from '../platform/store.js';
import type { DreamJob } from './dream-job.js';

export interface DreamWorkInput {
  jobId: number;
  version: string;
  expectedRoundGeneration: number;
  screenshotPath?: string;
}

export async function runDreamWorker(
  store: SubmissionStore | undefined,
  job: DreamJob | null,
  input: DreamWorkInput,
): Promise<string> {
  if (!job) return 'unavailable';
  const record = await store?.getSubmission(input.jobId);
  if (!record) return 'no_job';
  if ((record.roundGeneration ?? 1) !== input.expectedRoundGeneration) return 'superseded';
  return job.runForVersion({
    record,
    version: input.version,
    ...(input.screenshotPath ? { screenshotPath: input.screenshotPath } : {}),
  });
}
