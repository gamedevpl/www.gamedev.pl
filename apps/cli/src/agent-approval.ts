import { claudeApprovalEnv, type ApprovalDecision, type ApprovalRequest } from 'genaicode/agents';
import type { PickChoice } from './workshop.js';
import { commandApprovalKey, type commandApprovalMemory } from './agent-approval-memory.js';

const REMEMBER = 'Always allow this exact command (this session)';
export const AUTO_NEXT = 'Allow once and use Auto for next tasks';

function requestDetail(request: ApprovalRequest): string {
  const detail = request.detail as { input?: { command?: unknown } } | undefined;
  if (typeof detail?.input?.command === 'string') {
    const rest = { ...detail, input: { ...detail.input, command: undefined } };
    const command = detail.input.command.replace(/\p{Cc}/gu, (char) =>
      char === '\n' ? char : `\\u${char.charCodeAt(0).toString(16).padStart(4, '0')}`,
    );
    return `Command: ${command}\n${JSON.stringify(rest, null, 2)}`;
  }
  return JSON.stringify(request.detail ?? { summary: request.summary }, null, 2);
}

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
  autoNext?: () => void;
}): ApproveTool {
  let queue: Promise<unknown> = Promise.resolve();
  return (request, cancelled) => {
    const signal = cancelled ? AbortSignal.any([input.signal, cancelled]) : input.signal;
    const answer = queue.then(async (): Promise<ApprovalDecision> => {
      if (signal.aborted) return 'deny';
      const detail = requestDetail(request);
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
      const auto = input.autoNext && !turn;
      const autoNote = auto ? '\nAuto starts with a sandbox on the next task. This task stays in Ask.' : '';
      const question = `${input.agent} requests ${request.kind} permission.\n${detail}\n${duration}${memory}${autoNote}`;
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
        const choices = [allow, 'Deny', ...(key ? [REMEMBER] : []), ...(auto ? [AUTO_NEXT] : [])];
        const choice = await input.pick(choices, question, signal);
        const remember = Boolean(key && choice === REMEMBER && !signal.aborted);
        const useAuto = Boolean(auto && choice === AUTO_NEXT && !signal.aborted);
        const decision = !signal.aborted && (choice === allow || remember || useAuto) ? 'approve' : 'deny';
        if (useAuto) input.autoNext!();
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
