import { claudeApprovalEnv, type ApprovalDecision, type ApprovalRequest } from 'genaicode/agents';
import type { PickChoice } from './workshop.js';
import { commandApprovalKey, type commandApprovalMemory } from './agent-approval-memory.js';

const REMEMBER = 'Always allow this exact command (this session)';

// Vendor protocols come from genaicode; this module asks the creator.
export type ApproveTool = (request: ApprovalRequest, signal?: AbortSignal) => Promise<ApprovalDecision>;

export function approvalPrompt(input: {
  agent: string;
  pick: PickChoice;
  signal: AbortSignal;
  write: (line: string) => void;
  activity?: (text: string) => void;
  cwd?: string;
  remembered?: ReturnType<typeof commandApprovalMemory>;
}): ApproveTool {
  let queue: Promise<unknown> = Promise.resolve();
  return (request, cancelled) => {
    const signal = cancelled ? AbortSignal.any([input.signal, cancelled]) : input.signal;
    const answer = queue.then(async (): Promise<ApprovalDecision> => {
      if (signal.aborted) return 'deny';
      const detail = JSON.stringify(request.detail ?? { summary: request.summary }, null, 2);
      const turn = request.scope === 'turn';
      const key = input.cwd && input.remembered ? commandApprovalKey(request, input.agent, input.cwd) : undefined;
      const allow = turn ? 'Allow for this turn' : 'Allow once';
      const duration = turn
        ? 'Allow these permissions until the current turn ends?'
        : key
          ? 'Allow this invocation?'
          : 'Allow this invocation once?';
      const memory = key
        ? `\nAlways allow remembers only this exact command and execution options, for ${input.agent} in ${input.cwd}, until this CLI session ends. /permissions ask clears remembered commands.`
        : '';
      const question = `${input.agent} requests permission (${request.kind}). ${duration}${memory}\n${detail}`;
      if (question.length > 7500) {
        input.write(`${input.agent}: permission request is too large to display completely; denied.`);
        return 'deny';
      }
      if (key && input.remembered?.has(key)) {
        input.write(`${input.agent}: tool permission allowed by remembered command: ${request.summary ?? detail}.`);
        return 'approve';
      }
      input.activity?.(`${input.agent} needs your approval`);
      try {
        const choice = await input.pick(key ? ['Deny', allow, REMEMBER] : ['Deny', allow], question, signal);
        const remember = Boolean(key && choice === REMEMBER && !signal.aborted);
        const decision = !signal.aborted && (choice === allow || remember) ? 'approve' : 'deny';
        input.write(
          `${input.agent}: tool permission ${decision === 'approve' ? (remember ? 'allowed and remembered for this session' : turn ? 'allowed for this turn' : 'allowed once') : 'denied'}.`,
        );
        if (remember) input.remembered?.add(key!);
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

// Let Claude wait for the creator's answer.
export function approvalEnv(env: NodeJS.ProcessEnv, approvals: boolean | undefined): NodeJS.ProcessEnv {
  return approvals ? { ...env, ...claudeApprovalEnv(env) } : env;
}
