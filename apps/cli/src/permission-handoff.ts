import type { AdapterSpec } from './adapters.js';
import type { Workshop } from './workshop.js';
import { childEnv } from './delegate.js';

export async function permissionHandoff(input: {
  ws: Workshop;
  spec: AdapterSpec;
  cwd: string;
  prompt: string;
  conversation?: string;
  write: (line: string) => void;
  abort: AbortSignal;
  phase: (phase: 'permission' | 'interactive') => void;
}): Promise<boolean> {
  const { ws, spec, abort, write } = input;
  if (!ws.interactiveRun || ws.unattended) {
    write(`${spec.name} needs approval. Edits remain local; resume interactively before verifying or delivering.`);
    if (spec.name === 'muse' && input.conversation) write(`In the game directory: muse resume ${input.conversation}`);
    return false;
  }
  const name = spec.name === 'muse' ? 'Muse' : 'Antigravity';
  input.phase('permission');
  const open = `Open ${name} interactively`;
  const choice = await ws.pick(
    [open, 'Keep edits and return'],
    `${name} needs permission. Open its permission prompts in this terminal?`,
  );
  if (choice !== open || abort.aborted) return false;
  write(
    `${name} now owns the terminal. Answer its permission prompts or continue the session, then exit to return here for verification.`,
  );
  input.phase('interactive');
  const result = await ws.interactiveRun({
    spec,
    cwd: input.cwd,
    env: childEnv(ws.env, ''),
    prompt: input.prompt,
    conversation: input.conversation,
    logPath: ws.lastLog,
    abort,
  });
  write('Returned to gamedevpl.');
  if (result.code !== 0 || abort.aborted) {
    write(`Interactive ${name} stopped without success. Edits remain local; /diff to inspect.`);
    return false;
  }
  return true;
}
