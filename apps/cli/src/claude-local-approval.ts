import {
  claudeApprovalRequest,
  claudeApprovalTool,
  claudeSandboxRefuses,
  type ClaudeApprovalToolOptions,
} from 'genaicode/agents';
import type { ApproveTool } from './agent-approval.js';
import { sanitizeEventPayload } from './ansi.js';

// Sandboxed Bash can still prompt; GenAIcode 2.13.2 rejects every prompt.
export function claudeLocalApproval(
  onApproval: ApproveTool,
  options: ClaudeApprovalToolOptions,
  write: (line: string) => void,
) {
  const guarded = claudeApprovalTool(onApproval, options);
  const command = claudeApprovalTool(onApproval);
  return {
    ...guarded,
    async call(args: unknown, signal?: AbortSignal) {
      const request = claudeApprovalRequest(args);
      if (!request || !options.sandbox || options.sandbox === 'unrestricted') return guarded.call(args, signal);
      const detail = request.detail as { tool_name: string; input: Record<string, unknown> };
      if (options.sandbox === 'workspace-write' && detail.tool_name === 'Bash') {
        if (
          typeof detail.input.command === 'string' &&
          detail.input.command.trim() &&
          (detail.input.dangerouslyDisableSandbox === undefined || detail.input.dangerouslyDisableSandbox === false)
        )
          return command.call(args, signal);
      } else if (!claudeSandboxRefuses(args, options.sandbox, options.cwd ?? '')) return guarded.call(args, signal);
      const message =
        'Permission denied by the sandbox policy. Run this tool inside the game workspace without disabling the sandbox.';
      write(`claude: denied by sandbox policy: ${sanitizeEventPayload(request.summary ?? detail.tool_name, 1000)}`);
      return { content: [{ type: 'text' as const, text: JSON.stringify({ behavior: 'deny', message }) }] };
    },
  };
}
