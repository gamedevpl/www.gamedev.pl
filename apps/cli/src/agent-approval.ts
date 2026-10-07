import type { ApprovalDecision, ApprovalRequest } from 'genaicode/agents';
import type { PickChoice } from './workshop.js';

export type ScopedApprovalRequest = ApprovalRequest & { scope?: 'turn' };
export type ApproveTool = (request: ScopedApprovalRequest, signal?: AbortSignal) => Promise<ApprovalDecision>;

export function approvalPrompt(input: {
  agent: string;
  pick: PickChoice;
  signal: AbortSignal;
  write: (line: string) => void;
  activity?: (text: string) => void;
}): ApproveTool {
  let queue: Promise<unknown> = Promise.resolve();
  return (request, cancelled) => {
    const signal = cancelled ? AbortSignal.any([input.signal, cancelled]) : input.signal;
    const answer = queue.then(async (): Promise<ApprovalDecision> => {
      if (signal.aborted) return 'deny';
      const detail = JSON.stringify(request.detail ?? { summary: request.summary }, null, 2);
      const turn = request.scope === 'turn';
      const allow = turn ? 'Allow for this turn' : 'Allow once';
      const duration = turn ? 'Allow these permissions until the current turn ends?' : 'Allow this invocation once?';
      const question = `${input.agent} requests permission (${request.kind}). ${duration}\n${detail}`;
      if (question.length > 7500) {
        input.write(`${input.agent}: permission request is too large to display completely; denied.`);
        return 'deny';
      }
      input.activity?.(`${input.agent} needs your approval`);
      try {
        const choice = await input.pick(['Deny', allow], question, signal);
        const decision = !signal.aborted && choice === allow ? 'approve' : 'deny';
        input.write(
          `${input.agent}: tool permission ${decision === 'approve' ? (turn ? 'allowed for this turn' : 'allowed once') : 'denied'}.`,
        );
        return decision;
      } catch {
        return 'deny';
      } finally {
        input.activity?.(`${input.agent} is working`);
      }
    });
    queue = answer.catch(() => {});
    return answer;
  };
}
