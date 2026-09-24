import { isSettledAgentState } from '../platform/agent-state.js';
import type { Store, SubmissionRecord } from '../platform/store.js';
import type { BuilderKind } from './builder.js';
import type { createResumeBuild } from './resume-build.js';

export function createGateRepairHandler(deps: {
  store: Store | undefined;
  builderOf: (record: SubmissionRecord | null | undefined) => BuilderKind;
  resumeBuild: ReturnType<typeof createResumeBuild>;
  now: () => number;
  log: { error: (context: object, message: string) => void };
}) {
  return async ({ record, version, report }: { record: SubmissionRecord; version: string; report: string }) => {
    const { store, builderOf, resumeBuild, now, log } = deps;
    if (!store || builderOf(record) !== 'platform' || !record.dispatch?.refs.length) return false;
    const latest = await store.getSubmission(record.jobId);
    if (!latest?.agentEndedAt && !latest?.agentState) return false;
    if (!latest.agentEndedAt && latest.agentState && !isSettledAgentState(latest.agentState)) return false;
    const roundGeneration = record.roundGeneration ?? 1;
    if (!(await store.claimGateRepair(record.jobId, version, new Date(now()).toISOString(), roundGeneration)))
      return false;
    const outcome = await resumeBuild({
      jobId: record.jobId,
      feedback: '',
      locale: record.locale ?? 'en',
      log,
      undelivered: true,
      gateRepair: { version, report },
      transition: { by: 'reconciler', reason: 'gate_repair' },
    });
    if (!outcome.started) log.error({ jobId: record.jobId, reason: outcome.reason }, 'gate repair dispatch failed');
    return outcome.started;
  };
}
