import type { SessionController } from './session-controller.js';

export type SessionCommand =
  | { id: string; kind: 'input'; promptId: number; text: string }
  | { id: string; kind: 'queue'; taskId: number; text: string }
  | { id: string; kind: 'stop'; taskId: number };

export type CommandResult = {
  id: string;
  status: 'accepted' | 'stale' | 'invalid' | 'conflict' | 'capacity';
};

export function createSessionCommands(session: SessionController, limit = 1024) {
  const receipts = new Map<string, { fingerprint: string; result: CommandResult }>();
  return (command: SessionCommand): CommandResult => {
    const { id } = command;
    if (!/^[a-zA-Z0-9_-]{1,80}$/.test(id)) return { id, status: 'invalid' };
    const generation = command.kind === 'input' ? command.promptId : command.taskId;
    if (!Number.isSafeInteger(generation) || generation < 0) return { id, status: 'invalid' };
    if (command.kind !== 'stop' && (!command.text.trim() || command.text.length > 8000))
      return { id, status: 'invalid' };
    if (command.kind !== 'stop' && [...command.text].some((ch) => /\p{Cc}/u.test(ch) && ch !== '\n' && ch !== '\t'))
      return { id, status: 'invalid' };
    const fingerprint = JSON.stringify([command.kind, generation, command.kind === 'stop' ? null : command.text]);
    const previous = receipts.get(id);
    if (previous) return previous.fingerprint === fingerprint ? { ...previous.result } : { id, status: 'conflict' };
    const state = session.get();
    const message = command.kind === 'queue' || (command.kind === 'input' && !state.question && !state.choices.length);
    if (message && command.text.trimStart().startsWith('/'))
      return { id, status: 'invalid' };
    // Never evict a receipt and accidentally execute its retry again.
    if (receipts.size >= limit) return { id, status: 'capacity' };
    const result: CommandResult = { id, status: 'stale' };
    receipts.set(id, { fingerprint, result });
    const accepted =
      command.kind === 'input'
        ? session.acceptInput(command.text, command.promptId)
        : command.kind === 'queue'
          ? session.enqueueInput(command.text, command.taskId)
          : session.stopTask(command.taskId);
    result.status = accepted ? 'accepted' : 'stale';
    return { ...result };
  };
}
