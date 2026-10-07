import { RpcError, uuidv7, type LiveSession } from 'genaicode/agents';
import { z } from 'zod';

const record = z.record(z.unknown());
const museRequest = z
  .object({
    sessionId: z.string(),
    approvalId: z.string(),
    currentRequirementId: z.object({ approvalId: z.string(), sourceIndex: z.number().int() }).passthrough(),
    availableChoices: z.array(z.object({ choiceId: z.string(), decision: z.string(), scope: z.string().optional() })),
  })
  .passthrough();

export function liveApprovals(input: {
  session: LiveSession;
  muse: boolean;
  id: () => string;
  turn: () => string;
  active: () => boolean;
  fail: (message: string) => void;
}) {
  const { session } = input;
  const requests = new Map<string, Record<string, unknown>>();
  const stages = new Set<string>();
  const closed = new Set<string>();
  const ours = (value: Record<string, unknown>) =>
    input.active() &&
    Boolean(input.id()) &&
    value[input.muse ? 'sessionId' : 'threadId'] === input.id() &&
    (!value.turnId || !input.turn() || value.turnId === input.turn());

  async function decideMuse(raw: Record<string, unknown>) {
    const value = museRequest.parse(raw);
    const stage = `${value.approvalId}:${value.currentRequirementId.sourceIndex}`;
    if (stages.has(stage) || closed.has(value.approvalId)) return;
    stages.add(stage);
    const subject = record.safeParse(value.subject);
    const decision = await session.approve({
      id: stage,
      kind: subject.success && ['shell', 'process'].includes(String(subject.data.kind)) ? 'command' : 'other',
      detail: value,
    });
    if (!ours(value) || closed.has(value.approvalId)) return;
    const choices = value.availableChoices;
    const deny = choices.find((choice) => ['denied', 'abort'].includes(choice.decision));
    const choice =
      decision === 'approve'
        ? (choices.find((choice) => choice.decision === 'approved' && choice.scope === 'once') ?? deny)
        : deny;
    if (!choice) throw new Error('Muse offered no one-time approval or denial choice.');
    const ack = await session.rpc.request(
      'approval/decide',
      {
        sessionId: input.id(),
        approvalId: value.approvalId,
        choiceId: choice.choiceId,
        requirementId: value.currentRequirementId,
        commandId: uuidv7(),
      },
      30_000,
    );
    if (record.safeParse(ack).success && (ack as Record<string, unknown>).terminal === true)
      closed.add(value.approvalId);
  }

  function notification(method: string, raw: unknown): boolean {
    if (!input.muse || !['approval/requested', 'approval/updated'].includes(method)) return false;
    const parsed = record.safeParse(raw);
    if (!parsed.success || !ours(parsed.data)) return true;
    const value = parsed.data;
    if (typeof value.approvalId !== 'string') {
      input.fail('Muse sent an approval without an ID.');
      return true;
    }
    if (method === 'approval/requested') requests.set(value.approvalId, value);
    const original = requests.get(value.approvalId);
    const change = record.safeParse(value.change);
    if (change.success && change.data.kind === 'alreadyTerminal') {
      closed.add(value.approvalId);
      return true;
    }
    if (original)
      void decideMuse({ ...original, ...value }).catch((error: unknown) =>
        input.fail(`Cannot answer Muse approval: ${error instanceof Error ? error.message : String(error)}`),
      );
    return true;
  }

  async function request(method: string, raw: unknown): Promise<unknown> {
    const parsed = record.safeParse(raw);
    if (!parsed.success || !ours(parsed.data))
      throw new RpcError('Approval does not belong to the active task.', -32602);
    if (input.muse && method === 'approval/request') {
      notification('approval/requested', raw);
      return {};
    }
    const kinds = {
      'item/commandExecution/requestApproval': 'command',
      'item/fileChange/requestApproval': 'file-change',
    } as const;
    const kind = kinds[method as keyof typeof kinds];
    if (input.muse || !kind) throw new RpcError('Unsupported approval request.', -32601);
    const value = parsed.data;
    const decision = await session.approve({
      id: typeof value.approvalId === 'string' ? value.approvalId : uuidv7(),
      kind,
      detail: value,
    });
    return { decision: ours(value) && decision === 'approve' ? 'accept' : 'decline' };
  }
  return { notification, request };
}
