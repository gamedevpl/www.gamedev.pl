import { readFallback, saveFallback } from './agent-settings.js';
import { CliError, EXIT_INPUT } from './exit-codes.js';
import { BRAIN_AGENTS } from './play-brain.js';

const USAGE = 'fallback <agent…> picks them in order; fallback off turns it off';

// Shows or sets the agents Play fails over to.
export function fallbackCommand(input: {
  args: string[];
  env: NodeJS.ProcessEnv;
  write: (text: string) => void;
}): void {
  const names = input.args.flatMap((arg) => arg.split(',')).filter(Boolean);
  if (!names.length) {
    const current = readFallback(input.env);
    input.write(`Fallback: ${current.length ? current.join(' → ') : 'off'}`);
    input.write(`When Play's agent hits a limit, is signed out, missing or crashes, the next one takes over. ${USAGE}`);
    return;
  }
  if (names.length === 1 && names[0] === 'off') {
    saveFallback([], input.env);
    input.write('Fallback: off. A turn whose agent runs out just fails.');
    return;
  }
  const unknown = names.find((name) => !(BRAIN_AGENTS as readonly string[]).includes(name));
  if (unknown)
    throw new CliError(`${unknown} cannot take over Play`, EXIT_INPUT, `choose from ${BRAIN_AGENTS.join(', ')}`);
  saveFallback(names, input.env);
  input.write(`Fallback: ${[...new Set(names)].join(' → ')}. Applies to the next Play session.`);
}
