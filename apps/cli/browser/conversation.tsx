import { agentTranscriptLine } from '../src/transcript-line.js';
import { useEffect, useState } from 'react';
import { headline, RichText, TranscriptLines, useFollowScroll } from './transcript-view.js';

type Snapshot = { lines: string[]; workspace?: { mode: string } };

export function Conversation() {
  const [game, setGame] = useState(false);
  const [lines, setLines] = useState<string[]>([]);
  const { box, onScroll } = useFollowScroll(lines, 40);
  useEffect(() => {
    const update = (event: Event) => {
      const data = (event as CustomEvent<Snapshot>).detail;
      const next = data.lines;
      setGame(data.workspace?.mode === 'game');
      setLines((old) => (JSON.stringify(old) === JSON.stringify(next) ? old : next));
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
    } else if (line.trim()) output.push(line);
  }
  flush();
  return (
    <div id="conversation" ref={box} tabIndex={0} aria-label="Conversation" onScroll={onScroll}>
      {messages.map((message, i) =>
        message.kind === 'output' ? (
          <OutputBlock key={i} lines={message.lines!} />
        ) : (
          <article key={i} className={'message ' + message.kind}>
            <span className="message-author">{message.kind === 'user' ? 'You' : (message.author ?? 'gamedev.pl')}</span>
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
  );
}

function OutputBlock({ lines }: { lines: string[] }) {
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
