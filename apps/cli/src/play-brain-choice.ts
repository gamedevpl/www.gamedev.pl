import { CliError, EXIT_INPUT } from './exit-codes.js';

export const BRAIN_ENV = 'GAMEDEVPL_BRAIN';
const BRAIN_CHOICES = ['app-agent', 'auto', 'repl'] as const;
// app-agent: the Play agent whenever one can run; auto: the same, silently falling back; repl: the workshop.
export type BrainChoice = (typeof BRAIN_CHOICES)[number];

export function parseBrainChoice(value: string | boolean): BrainChoice {
  if (typeof value === 'string' && (BRAIN_CHOICES as readonly string[]).includes(value)) return value as BrainChoice;
  throw new CliError('--brain needs a mode', EXIT_INPUT, BRAIN_CHOICES.join(', '));
}

// The workshop stays the default until the Play agent has been smoke-tested on real agents.
export function brainChoice(env: NodeJS.ProcessEnv): BrainChoice {
  const value = env[BRAIN_ENV];
  return value === 'app-agent' || value === 'auto' ? value : 'repl';
}

export function brainRequested(env: NodeJS.ProcessEnv): boolean {
  return brainChoice(env) !== 'repl';
}
