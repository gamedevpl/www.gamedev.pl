import type { AgentEvent } from 'genaicode/agents';
import { CliError, EXIT_RED } from './exit-codes.js';

function eventText(event: AgentEvent): string | undefined {
  if (event.type === 'error') return event.message;
  if (event.type === 'stderr' || event.type === 'message') return event.text;
  if (event.type === 'raw') return event.line;
  return undefined;
}

export function trackAgentFailure(adapter: string) {
  let capacity = false;
  return {
    observe(event: AgentEvent) {
      const text = eventText(event);
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
