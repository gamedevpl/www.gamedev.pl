export type BuildChoice = 'platform' | 'local';

export function chooseBuilder(input: {
  hasLocal: boolean;
  flags: Record<string, string | boolean>;
  ask?: () => BuildChoice;
}): BuildChoice {
  if (input.flags.platform === true) return 'platform';
  if (typeof input.flags.agent === 'string' && input.flags.agent) return 'local';
  if (!input.hasLocal) return 'platform';
  return input.ask?.() ?? 'platform';
}

export function costCopy(choice: BuildChoice, adapter?: string): string {
  if (choice === 'platform') return 'platform builder — counts against your gamedev.pl quota';
  return `local ${adapter ?? 'agent'} — your subscription; budget via the adapter flags or a wall-clock timeout`;
}
