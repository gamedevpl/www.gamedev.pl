import { userText, type AppAgentState } from 'genaicode/react';
import type { Delivery } from '../src/session-delivery.js';

export function playLines(lines: string[], state: AppAgentState, deliveries: Delivery[]): string[] {
  const turns = [...state.history, ...(state.session?.turns ?? [])];
  const prompts = new Set(turns.map((turn) => userText(turn.prompt).trim()));
  const texts = new Set(
    turns.flatMap((turn) =>
      turn.entries.flatMap((entry) =>
        entry.kind === 'text' ? [entry.text.trim()] : entry.kind === 'error' ? [`! ${entry.message}`] : [],
      ),
    ),
  );
  const duplicates = new Map<string, number>();
  for (const delivery of deliveries) duplicates.set(delivery.text, (duplicates.get(delivery.text) ?? 0) + 1);
  return [...lines]
    .reverse()
    .filter((line) => {
      const steered = line.match(/^› \[(?:sent to active agent|message to agent)\] ([\s\S]*)$/)?.[1];
      if (steered && (duplicates.get(steered) ?? 0) > 0) {
        duplicates.set(steered, duplicates.get(steered)! - 1);
        return false;
      }
      return (
        !line.startsWith('  · ') &&
        !texts.has(line.trim()) &&
        !(line.startsWith('› ') && prompts.has(line.slice(2).trim()))
      );
    })
    .reverse();
}
