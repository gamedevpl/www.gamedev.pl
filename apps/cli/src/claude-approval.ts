import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import type { ApproveTool } from './agent-approval.js';

export const CLAUDE_PERMISSION_TOOL = 'approve_tool';
export const claudePermissionTool = {
  name: CLAUDE_PERMISSION_TOOL,
  description: 'Ask the creator whether Claude may perform this exact tool invocation.',
  inputSchema: {
    type: 'object',
    properties: { tool_name: { type: 'string' }, input: { type: 'object' }, tool_use_id: { type: 'string' } },
    required: ['tool_name', 'input'],
  },
};
const requestSchema = z.object({
  tool_name: z.string().min(1).max(200),
  input: z.record(z.unknown()),
  tool_use_id: z.string().optional(),
});

export async function claudePermission(raw: unknown, approve: ApproveTool, signal: AbortSignal) {
  const parsed = requestSchema.safeParse(raw);
  let result: unknown = { behavior: 'deny', message: 'Permission denied by the creator or request cancelled.' };
  if (parsed.success && !signal.aborted) {
    const value = parsed.data;
    const decision = await approve(
      {
        id: value.tool_use_id ?? randomUUID(),
        kind: value.tool_name === 'Bash' ? 'command' : 'other',
        summary: value.tool_name,
        detail: { tool: value.tool_name, input: value.input },
      },
      signal,
    ).catch(() => 'deny');
    if (decision === 'approve' && !signal.aborted) result = { behavior: 'allow', updatedInput: value.input };
  }
  return { content: [{ type: 'text', text: JSON.stringify(result) }] };
}
