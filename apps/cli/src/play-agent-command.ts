import type { AppAgent } from 'genaicode/app-agent';
import * as z from 'zod';
import { formatError } from './errors.js';

const id = z.string().regex(/^[a-zA-Z0-9_-]{1,80}$/);
// Picked labels or typed text per question id; genaicode's limits.
const answers = z.record(z.string().max(500), z.array(z.string().max(10_000)).max(21));

// Browser chat answers to the Play agent; messages use /commands.
const agentCommand = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('action'), id, decision: z.enum(['approve', 'reject']) }).strict(),
  z.object({ kind: z.literal('approval'), id, decision: z.enum(['approve', 'deny']) }).strict(),
  z.object({ kind: z.literal('answer'), id, answers }).strict(),
  z.object({ kind: z.literal('reset') }).strict(),
]);

// Applies one browser card answer to the Play agent.
export function playAgentCommand(agent: AppAgent | undefined, input: unknown): { status: number; body: unknown } {
  const parsed = agentCommand.safeParse(input);
  if (!agent) return { status: 404, body: { error: 'No Play agent is running' } };
  if (!parsed.success) return { status: 400, body: { error: 'Invalid agent command' } };
  const command = parsed.data;
  try {
    if (command.kind === 'action') agent.decide(command.id, command.decision);
    else if (command.kind === 'approval') agent.approve(command.id, command.decision);
    else if (command.kind === 'answer') agent.answer(command.id, command.answers);
    else agent.reset();
  } catch (error) {
    return { status: 409, body: { error: formatError(error) } };
  }
  return { status: 200, body: agent.get() };
}
