import type { AppAgent } from 'genaicode/app-agent';

// The agent's conversation as session lines for terminal and browser.
export function mirrorPlayBrain(agent: AppAgent, write: (line: string) => void, activity: (text: string) => void) {
  const shown = new Map<number, number>();
  let busy = false;
  return agent.subscribe((state) => {
    const running = state.session?.status === 'running';
    if (running !== busy) {
      busy = running;
      activity(running ? `${state.agent} is working — Ctrl+C stops it` : '');
    }
    for (const turn of state.session?.turns ?? []) {
      const from = shown.get(turn.id) ?? 0;
      const ended = turn.endedAt !== undefined;
      let index = from;
      for (; index < turn.entries.length; index++) {
        const entry = turn.entries[index]!;
        const last = index === turn.entries.length - 1;
        if (last && !ended && ((entry.kind === 'text' && entry.streaming) || (entry.kind === 'tool' && !entry.done)))
          break;
        if (entry.kind === 'text' && entry.text.trim()) write(entry.text.trim());
        else if (entry.kind === 'tool')
          write(`  · ${entry.name.replace(/^mcp__gamedevpl__/, '')}${entry.isError ? ' (failed)' : ''}`);
        else if (entry.kind === 'error') write(`! ${entry.message}`);
      }
      shown.set(turn.id, index);
    }
  });
}
