import { agentTranscriptLine } from '../src/transcript-line.js';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useFollowScroll } from 'genaicode/react';
import { headline, RichText, TranscriptLines } from './transcript-view.js';
import type { SessionDiff, SessionDiffInfo } from '../src/session-diff.js';
import { DiffFlyout } from './diff-flyout.js';

type Snapshot = {
  lines: string[];
  diffs?: SessionDiffInfo[];
  readDiff?: (id: number) => Promise<SessionDiff>;
  workspace?: { mode: string };
};

export function Conversation() {
  const [game, setGame] = useState(false);
  const [lines, setLines] = useState<string[]>([]);
  const [diffs, setDiffs] = useState<SessionDiffInfo[]>([]);
  const [selected, setSelected] = useState<SessionDiffInfo | null>(null);
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
  const messages: Array<{ text: string; author?: string; kind: 'user' | 'assistant' | 'output'; lines?: string[] }> =
    [];
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
  return (
    <>
      <div id="conversation" ref={box} tabIndex={0} aria-label="Conversation" onScroll={onScroll}>
        {messages.map((message, i) =>
          message.kind === 'output' ? (
            <OutputBlock key={i} lines={message.lines!} diffs={diffs} openDiff={setSelected} />
          ) : (
            <article key={i} className={'message ' + message.kind}>
              <span className="message-author">
                {message.kind === 'user' ? 'You' : (message.author ?? 'gamedev.pl')}
              </span>
              <p>
                <RichText text={message.text} />
              </p>
            </article>
          ),
        )}
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
