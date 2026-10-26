import { WORKBENCH_ACTIONS, actionLine, type WorkbenchAction } from './workbench-actions.js';
import type { SessionController } from './session-controller.js';

export type SessionCommand =
  | { id: string; kind: 'input'; promptId: number; text: string; attachments?: string[] }
  | { id: string; kind: 'queue'; taskId: number; text: string; attachments?: string[] }
  | { id: string; kind: 'action'; promptId: number; action: WorkbenchAction; argument?: string }
  | { id: string; kind: 'stop'; taskId: number };

export type CommandResult = {
  id: string;
  status: 'accepted' | 'stale' | 'invalid' | 'conflict' | 'capacity';
};

// `done`: final result once the working agent answers.
export type DispatchResult = CommandResult & { done?: Promise<CommandResult> };

export function createSessionCommands(
  session: SessionController,
  limit = 1024,
  attachmentText?: (ids: string[]) => string,
) {
  const receipts = new Map<string, { fingerprint: string; result: CommandResult; done?: Promise<CommandResult> }>();
  return (command: SessionCommand): DispatchResult => {
    const { id } = command;
    if (!/^[a-zA-Z0-9_-]{1,80}$/.test(id)) return { id, status: 'invalid' };
    const generation = command.kind === 'input' || command.kind === 'action' ? command.promptId : command.taskId;
    const fingerprint = JSON.stringify([
      command.kind,
      generation,
      command.kind === 'action'
        ? [command.action, command.argument]
        : command.kind === 'stop'
          ? null
          : [command.text, command.attachments ?? []],
    ]);
    const previous = receipts.get(id);
    if (previous)
      return previous.fingerprint === fingerprint
        ? { ...previous.result, ...(previous.done ? { done: previous.done } : {}) }
        : { id, status: 'conflict' };
    if (!Number.isSafeInteger(generation) || generation < 0) return { id, status: 'invalid' };
    if ((command.kind === 'input' || command.kind === 'queue') && (!command.text.trim() || command.text.length > 8000))
      return { id, status: 'invalid' };
    if (
      (command.kind === 'input' || command.kind === 'queue') &&
      [...command.text].some((ch) => /\p{Cc}/u.test(ch) && ch !== '\n' && ch !== '\t')
    )
      return { id, status: 'invalid' };
    let actionText = '';
    if (command.kind === 'action') {
      try {
        actionText = actionLine(command.action, command.argument);
      } catch {
        return { id, status: 'invalid' };
      }
    }
    const state = session.get();
    if (command.kind === 'action' && !Object.hasOwn(WORKBENCH_ACTIONS, command.action))
      return { id, status: 'invalid' };
    const message = command.kind === 'queue' || (command.kind === 'input' && !state.question && !state.choices.length);
    if (message && /^[!/]/.test(command.text.trimStart())) return { id, status: 'invalid' };
    let text = command.kind === 'input' || command.kind === 'queue' ? command.text : '';
    if ((command.kind === 'input' || command.kind === 'queue') && command.attachments?.length) {
      if (!attachmentText || (command.kind === 'input' && (state.question || state.choices.length)))
        return { id, status: 'invalid' };
      try {
        text += attachmentText(command.attachments);
      } catch {
        return { id, status: 'invalid' };
      }
    }
    // Never evict a receipt and accidentally execute its retry again.
    if (receipts.size >= limit) return { id, status: 'capacity' };
    const result: CommandResult = { id, status: 'stale' };
    receipts.set(id, { fingerprint, result });
    if (command.kind === 'queue' && state.canSteer) {
      const sent = session.steerInput(text, command.taskId);
      if (!sent) return { ...result };
      // Accepted only once taken; a failed send keeps the browser draft.
      const done = sent.then((ok) => {
        result.status = ok ? 'accepted' : 'stale';
        return { ...result };
      });
      receipts.set(id, { fingerprint, result, done });
      return { ...result, done };
    }
    const accepted =
      command.kind === 'action'
        ? !state.question && state.mode === 'prompt' && session.acceptInput(actionText, command.promptId)
        : command.kind === 'input'
          ? session.acceptInput(text, command.promptId)
          : command.kind === 'queue'
            ? session.enqueueInput(text, command.taskId)
            : session.stopTask(command.taskId);
    result.status = accepted ? 'accepted' : 'stale';
    return { ...result };
  };
}
