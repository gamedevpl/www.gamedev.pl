import { parseEventLine } from './delegate.js';
import { CliError, EXIT_RED } from './exit-codes.js';

export function trackAgentFailure(adapter: string) {
  let capacity = false;
  return {
    observe(line: string) {
      const text = parseEventLine(line, adapter);
      if (text && /^selected model is at capacity\b/i.test(text.trim())) capacity = true;
    },
    error(code: number | null, retry: string): CliError {
      return new CliError(
        capacity
          ? `${adapter} stopped: the selected model is at capacity. Task completion is not confirmed.`
          : `${adapter} stopped (exit ${code ?? 'unknown'}). Task completion is not confirmed.`,
        EXIT_RED,
        capacity ? `Wait and retry: ${retry}. Or change the model in ${adapter} settings before retrying.` : retry,
      );
    },
  };
}
