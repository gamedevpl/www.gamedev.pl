import { agentTranscriptLine } from '../src/transcript-line.js';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AppAgentChat, userText, useFollowScroll, type AppAgentClient, type AppAgentState } from 'genaicode/react';
import { codeApi } from './code-api.js';
import { headline, RichText, TranscriptLines } from './transcript-view.js';
import type { SessionDiff, SessionDiffInfo } from '../src/session-diff.js';
import { DiffFlyout } from './diff-flyout.js';

type Snapshot = {
  lines: string[];
  diffs?: SessionDiffInfo[];
  readDiff?: (id: number) => Promise<SessionDiff>;
  workspace?: { mode: string };
  // Set while the Play agent (GAMEDEVPL_BRAIN=app-agent) takes the creator's messages.
  agent?: AppAgentState;
};

export function Conversation() {
  const [game, setGame] = useState(false);
  const [lines, setLines] = useState<string[]>([]);
  const [diffs, setDiffs] = useState<SessionDiffInfo[]>([]);
  const [selected, setSelected] = useState<SessionDiffInfo | null>(null);
  const [agent, setAgent] = useState<AppAgentState | null>(null);
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
  if (agent)
    return (
      <>
        <AgentConversation
          state={agent}
          log={sessionMessages(playLines(lines, agent), diffs)}
          diffs={diffs}
          openDiff={setSelected}
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

// Session lines the agent chat does not already show: slash commands, checks, delivery.
function playLines(lines: string[], state: AppAgentState): string[] {
  const turns = [...state.history, ...(state.session?.turns ?? [])];
  const prompts = new Set(turns.map((turn) => userText(turn.prompt).trim()));
  const texts = new Set(
    turns.flatMap((turn) =>
      turn.entries.flatMap((entry) =>
        entry.kind === 'text' ? [entry.text.trim()] : entry.kind === 'error' ? [`! ${entry.message}`] : [],
      ),
    ),
  );
  return lines.filter(
    (line) =>
      !line.startsWith('  · ') &&
      !texts.has(line.trim()) &&
      !(line.startsWith('› ') && prompts.has(line.slice(2).trim())),
  );
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
            <p>
              <RichText text={message.text} />
            </p>
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

// The Play agent's chat. Messages still go through Play's own composer (attachments, slash commands,
// the terminal's queue); the chat answers its cards and prompts itself.
function AgentConversation({
  state,
  log,
  diffs,
  openDiff,
}: {
  state: AppAgentState;
  log: SessionMessage[];
  diffs: SessionDiffInfo[];
  openDiff: (diff: SessionDiffInfo) => void;
}) {
  const [error, setError] = useState<string | null>(null);
  const client = useMemo<AppAgentClient>(() => {
    const call = (command: unknown) => {
      setError(null);
      codeApi('/agent', command).catch((failure: unknown) =>
        setError(failure instanceof Error ? failure.message : String(failure)),
      );
    };
    return {
      state,
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
  return (
    <div id="conversation" className="play-agent" aria-label="Conversation">
      <AppAgentChat
        client={client}
        foldSteps
        theme="dark"
        emptyState={
          <div className="conversation-welcome">
            <h2>What shall we change?</h2>
            <p>Describe the change below. The agent edits, checks and asks before it delivers.</p>
          </div>
        }
      />
      {log.length > 0 && (
        <div className="play-agent-log" aria-label="Session output">
          <SessionMessages messages={log} diffs={diffs} openDiff={openDiff} />
        </div>
      )}
    </div>
  );
}
