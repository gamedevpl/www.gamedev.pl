import { PlayAgentChat, renderEvidencePrompt } from './evidence-prompt.js';
import { agentTranscriptLine } from '../src/transcript-line.js';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useFollowScroll, type AppAgentClient, type AppAgentState } from 'genaicode/react';
import { codeApi } from './code-api.js';
import { headline, RichText, TranscriptLines } from './transcript-view.js';
import type { SessionDiff, SessionDiffInfo } from '../src/session-diff.js';
import { DiffFlyout } from './diff-flyout.js';
import { showAgentQuestions } from './agent-questions.js';
import { AgentProgress } from './agent-progress.js';
import type { Delivery } from '../src/session-delivery.js';
import { playLines } from './play-lines.js';

type Snapshot = {
  lines: string[];
  diffs?: SessionDiffInfo[];
  readDiff?: (id: number) => Promise<SessionDiff>;
  workspace?: { mode: string };
  // Set while the Play agent (GAMEDEVPL_BRAIN=app-agent) takes messages.
  agent?: AppAgentState;
  deliveries?: Delivery[];
};

export function Conversation() {
  const [game, setGame] = useState(false);
  const [lines, setLines] = useState<string[]>([]);
  const [diffs, setDiffs] = useState<SessionDiffInfo[]>([]);
  const [selected, setSelected] = useState<SessionDiffInfo | null>(null);
  const [agent, setAgent] = useState<AppAgentState | null>(null);
  const [deliveries, setDeliveries] = useState<Delivery[]>([]);
  const readDiff = useRef<Snapshot['readDiff']>();
  const loadDiff = useCallback(
    (id: number) => (readDiff.current ? readDiff.current(id) : Promise.reject(new Error('Diff unavailable'))),
    [],
  );
  const latestDiff = useRef(0);
  const { ref: box, onScroll } = useFollowScroll(lines, 40);
  useEffect(() => {
    const update = (event: Event) => {
      const data = (event as CustomEvent<Snapshot>).detail;
      const next = data.lines;
      setGame(data.workspace?.mode === 'game');
      setLines((old) => (JSON.stringify(old) === JSON.stringify(next) ? old : next));
      setDiffs(data.diffs ?? []);
      setAgent(data.agent ?? null);
      setDeliveries(data.deliveries ?? []);
      readDiff.current = data.readDiff;
      const latest = data.diffs?.at(-1);
      if (latest && latest.id > latestDiff.current) {
        latestDiff.current = latest.id;
        setSelected(latest);
      }
    };
    window.addEventListener('play-session', update);
    return () => window.removeEventListener('play-session', update);
  }, []);
  const messages = sessionMessages(lines, diffs);
  // Keep the transcript visible until the agent receives its first turn.
  const awaitingFirstTurn =
    agent &&
    !agent.history.length &&
    !agent.session?.turns.length &&
    messages.some((message) => message.kind === 'user');
  if (agent && !awaitingFirstTurn)
    return (
      <>
        <AgentConversation
          state={agent}
          log={sessionMessages(playLines(lines, agent, deliveries), diffs)}
          diffs={diffs}
          openDiff={setSelected}
          deliveries={deliveries}
        />
        <DiffFlyout diff={selected} read={loadDiff} close={() => setSelected(null)} />
      </>
    );
  return (
    <>
      <div id="conversation" ref={box} tabIndex={0} aria-label="Conversation" onScroll={onScroll}>
        <SessionMessages messages={messages} diffs={diffs} openDiff={setSelected} />
        {!messages.some((message) => message.kind !== 'output') && (
          <div className="conversation-welcome">
            <h2>{game ? 'What shall we change?' : 'What would you like to make?'}</h2>
            <p>
              {game
                ? 'Play a little, then describe your idea or capture a moment. Your game stays open.'
                : 'Describe a game or add a reference. We will work through the idea and choose a builder before execution.'}
            </p>
          </div>
        )}
      </div>
      <DiffFlyout diff={selected} read={loadDiff} close={() => setSelected(null)} />
    </>
  );
}

type SessionMessage = { text: string; author?: string; kind: 'user' | 'assistant' | 'output'; lines?: string[] };

function sessionMessages(lines: string[], diffs: SessionDiffInfo[]): SessionMessage[] {
  const messages: SessionMessage[] = [];
  let output: string[] = [];
  const flush = () => {
    if (output.length) messages.push({ text: output.join('\n'), kind: 'output', lines: output });
    output = [];
  };
  for (const line of lines) {
    const agent = agentTranscriptLine(line);
    if (/^(› |◆ )/.test(line) || (agent && !agent.tool)) {
      flush();
      messages.push({
        text: agent?.text ?? line.replace(/^[›◆] /, ''),
        author: agent?.author,
        kind: line.startsWith('› ') ? 'user' : 'assistant',
      });
    } else if (diffs.some((diff) => diff.summary === line)) {
      flush();
      messages.push({ text: line, kind: 'output', lines: [line] });
    } else if (line.trim()) output.push(line);
  }
  flush();
  return messages;
}

function SessionMessages({
  messages,
  diffs,
  openDiff,
}: {
  messages: SessionMessage[];
  diffs: SessionDiffInfo[];
  openDiff: (diff: SessionDiffInfo) => void;
}) {
  return (
    <>
      {messages.map((message, i) =>
        message.kind === 'output' ? (
          <OutputBlock key={i} lines={message.lines!} diffs={diffs} openDiff={openDiff} />
        ) : (
          <article key={i} className={'message ' + message.kind}>
            <span className="message-author">{message.kind === 'user' ? 'You' : (message.author ?? 'gamedev.pl')}</span>
            {(message.kind === 'user' ? renderEvidencePrompt(message.text) : undefined) ?? (
              <p>
                <RichText text={message.text} />
              </p>
            )}
          </article>
        ),
      )}
    </>
  );
}

function OutputBlock({
  lines,
  diffs,
  openDiff,
}: {
  lines: string[];
  diffs: SessionDiffInfo[];
  openDiff: (diff: SessionDiffInfo) => void;
}) {
  const diff = diffs.find((item) => lines.includes(item.summary));
  if (diff)
    return (
      <div className="message session-output diff-card">
        <span>
          {diff.files.length} {diff.files.length === 1 ? 'file changed' : 'files changed'}
        </span>
        <button type="button" onClick={() => openDiff(diff)}>
          View diff
        </button>
      </div>
    );
  const top = headline(lines);
  const failed = top.style.tone === 'red';
  return (
    <details className={'message session-output' + (top.style.tone ? ' tone-' + top.style.tone : '')} open={failed}>
      <summary>
        <span className="tl-label">{top.style.label.trim() || '·'}</span>
        <span className="summary-text">{top.line.slice(0, 140)}</span>
        {lines.length > 1 && <span className="summary-count">{lines.length}</span>}
      </summary>
      <TranscriptLines lines={lines} />
    </details>
  );
}

// The Play agent's chat; messages still go through Play's composer.
function AgentConversation({
  state,
  log,
  diffs,
  openDiff,
  deliveries,
}: {
  state: AppAgentState;
  log: SessionMessage[];
  diffs: SessionDiffInfo[];
  openDiff: (diff: SessionDiffInfo) => void;
  deliveries: Delivery[];
}) {
  const [error, setError] = useState<string | null>(null);
  const [dismissed, setDismissed] = useState<string[]>(() => {
    try {
      const saved: unknown = JSON.parse(localStorage.getItem('play-dismissed-actions') ?? '[]');
      return Array.isArray(saved) ? saved.filter((item): item is string => typeof item === 'string').slice(-100) : [];
    } catch {
      return [];
    }
  });
  const dismiss = (key: string) => {
    setDismissed((previous) => {
      const next = [...previous, key].slice(-100);
      try {
        localStorage.setItem('play-dismissed-actions', JSON.stringify(next));
      } catch {
        // The card can still be hidden for this session.
      }
      return next;
    });
  };
  const client = useMemo<AppAgentClient>(() => {
    const call = (command: unknown) => {
      setError(null);
      codeApi('/agent', command).catch((failure: unknown) =>
        setError(failure instanceof Error ? failure.message : String(failure)),
      );
    };
    return {
      state: {
        ...showAgentQuestions(state),
        actions: state.actions.filter((action) => action.status === 'pending' || action.status === 'running'),
      },
      error,
      send(text) {
        const draft = document.getElementById('prompt') as HTMLTextAreaElement | null;
        if (!draft) return;
        draft.value = text;
        (document.getElementById('composer') as HTMLFormElement | null)?.requestSubmit();
      },
      stop: () => (document.getElementById('stop') as HTMLButtonElement | null)?.click(),
      reset: () => call({ kind: 'reset' }),
      configure() {},
      view() {},
      decide: (id, decision) => call({ kind: 'action', id, decision }),
      approve: (id, decision) => call({ kind: 'approval', id, decision }),
      changes: () => Promise.reject(new Error('Play delivers edits itself; use /diff.')),
    };
  }, [state, error]);
  const finished = state.actions.filter(
    (action) =>
      action.status !== 'pending' &&
      action.status !== 'running' &&
      !dismissed.includes(`${action.id}:${action.createdAt}`),
  );
  const failed = finished.filter((action) => action.status === 'failed').length;
  const labels: Record<Delivery['status'], string> = {
    pending: 'Waiting for the agent',
    received: 'Received by the agent',
    queued: 'Queued; stopping may discard it',
    unconfirmed: 'Delivery not confirmed',
  };
  const unconfirmed = deliveries.filter((item) => item.status === 'unconfirmed').length;
  const waiting = deliveries.filter((item) => item.status === 'pending' || item.status === 'queued').length;
  return (
    <div id="conversation" className="play-agent" aria-label="Conversation">
      <PlayAgentChat
        client={client}
        renderPrompt={renderEvidencePrompt}
        foldSteps
        theme="dark"
        renderAction={(action) =>
          action.kind === 'tool' && action.tool ? (
            <details className="play-action-details">
              <summary>Details</summary>
              <code>{action.tool.name}</code>
              {Object.keys(action.tool.args).length > 0 && <pre>{JSON.stringify(action.tool.args, null, 2)}</pre>}
            </details>
          ) : undefined
        }
        emptyState={
          <div className="conversation-welcome">
            <h2>What shall we change?</h2>
            <p>Describe the change below. The agent edits, checks and asks before it delivers.</p>
          </div>
        }
      />
      {deliveries.length > 0 && (
        <details className="play-deliveries" aria-label="Message delivery">
          <summary>
            {unconfirmed ? `${unconfirmed} unconfirmed · ` : ''}
            {waiting ? `${waiting} awaiting agent · ` : ''}
            {!unconfirmed && !waiting ? 'Received by agent · ' : ''}
            {deliveries.length} {deliveries.length === 1 ? 'message' : 'messages'}
          </summary>
          <ul>
            {deliveries.map((item) => (
              <li key={item.id}>
                <span>{item.text}</span>
                <small>{labels[item.status]}</small>
              </li>
            ))}
          </ul>
        </details>
      )}
      {finished.length > 0 && (
        <details className="play-finished-actions">
          <summary>
            {failed ? `${failed} failed · ` : ''}
            {finished.length} completed {finished.length === 1 ? 'action' : 'actions'}
          </summary>
          {finished.map((action) => (
            <details className="play-finished-action" key={`${action.id}:${action.createdAt}`}>
              <summary>
                {action.summary} · {action.status}
              </summary>
              {action.result && <pre>{action.result}</pre>}
              <button
                type="button"
                onClick={() => dismiss(`${action.id}:${action.createdAt}`)}
                aria-label={`Dismiss ${action.summary}`}
              >
                Dismiss
              </button>
            </details>
          ))}
        </details>
      )}
      <AgentProgress state={state} />
      {log.length > 0 && (
        // Folded, so only the agent chat scrolls.
        <details className="play-agent-log" aria-label="Session output">
          <summary>
            Session output <span className="play-agent-log-count">{log.length}</span>
          </summary>
          <SessionMessages messages={log} diffs={diffs} openDiff={openDiff} />
        </details>
      )}
    </div>
  );
}
