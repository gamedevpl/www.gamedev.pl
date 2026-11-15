import { CliError, EXIT_INPUT } from './exit-codes.js';

export function deliverySummary(value: unknown): string | undefined {
  if (value === undefined) return undefined;
  if (typeof value !== 'string' || !value.trim() || value.trim().length > 1024) {
    throw new CliError('--summary needs a description of 1–1024 characters', EXIT_INPUT);
  }
  return value.trim();
}
