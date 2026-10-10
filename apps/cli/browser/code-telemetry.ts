import type { CodeStep } from '@gamedevpl/contract';
import type { CompletionReporter } from '../../web/src/surfaces/studio/codeMirrorTypes.js';
import { codeApi } from './code-api.js';

const steps = new Set<string>();
export function reportCodeStep(step: CodeStep) {
  if (steps.has(step)) return;
  steps.add(step);
  void codeApi('/code/telemetry', { type: 'code_step', step }).catch(() => {});
}
export const reportCodeCompletion: CompletionReporter = (metric) => {
  void codeApi('/code/telemetry', {
    type: 'code_completion',
    ...metric,
    latencyMs: Math.min(30_000, Math.max(0, Math.round(metric.latencyMs))),
  }).catch(() => {});
};
