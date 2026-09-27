import type { ResumeOutcome } from './resume-build.js';

export type BuilderHandoffOutcome = ResumeOutcome | { started: false; reason: string };

export interface BuilderHandoffAckInput {
  jobId: number;
  acknowledgedAt: string;
  log: { error: (context: object, message: string) => void };
  roundGeneration?: number;
  finalize?: () => Promise<void>;
}
