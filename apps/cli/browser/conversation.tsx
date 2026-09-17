import { agentTranscriptLine } from '../src/transcript-line.js';
import { useEffect, useRef, useState } from 'react';

type Snapshot = { lines: string[]; workspace?: { mode: string } };

export function Conversation() {
  const [game, setGame] = useState(false);
  const [lines, setLines] = useState<string[]>([]);
  const box = useRef<HTMLDivElement>(null);
  const follow = useRef(true);
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
  useEffect(() => {
    if (follow.current && box.current) box.current.scrollTop = box.current.scrollHeight;
  }, [lines]);
  const messages: Array<{ text: string; author?: string; kind: 'user' | 'assistant' | 'output' }> = [];
  let output: string[] = [];
  const flush = () => {
    if (output.length) messages.push({ text: output.join('\n'), kind: 'output' });
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
    <div
      id="conversation"
      ref={box}
      tabIndex={0}
      aria-label="Conversation"
      onScroll={() => {
        const node = box.current!;
        follow.current = node.scrollTop + node.clientHeight >= node.scrollHeight - 40;
      }}
    >
      {messages.map((message, i) =>
        message.kind === 'output' ? (
          <details key={i} className="message session-output">
            <summary>{message.text.split('\n')[0]?.slice(0, 140)}</summary>
            <pre>{message.text}</pre>
          </details>
        ) : (
          <article key={i} className={'message ' + message.kind}>
            <span className="message-author">{message.kind === 'user' ? 'You' : (message.author ?? 'gamedev.pl')}</span>
            <p>{message.text}</p>
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
