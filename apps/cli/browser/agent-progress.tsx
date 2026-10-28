import { Markdown, type AppAgentState } from 'genaicode/react';

export function AgentProgress({ state }: { state: AppAgentState }) {
  const turn = state.session?.turns.at(-1);
  const latest = turn?.entries.filter((entry) => entry.kind === 'text' && entry.text.trim()).at(-1);
  if (
    state.session?.status !== 'running' ||
    !turn ||
    turn.result ||
    latest?.kind !== 'text' ||
    latest === turn.entries.at(-1)
  )
    return null;
  return (
    <aside className="play-agent-progress" role="status" aria-label="Agent progress">
      <span className="play-agent-progress-label">Status update</span>
      <div className="play-agent-progress-text" tabIndex={0}>
        <Markdown text={latest.text} streaming={latest.streaming} />
      </div>
    </aside>
  );
}
