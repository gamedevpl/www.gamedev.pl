import { useEffect, useRef, useState } from 'react';

type Snapshot = { lines: string[] };

export function Conversation() {
  const [lines, setLines] = useState<string[]>([]);
  const box = useRef<HTMLDivElement>(null);
  const follow = useRef(true);
  useEffect(() => {
    const update = (event: Event) => {
      const next = (event as CustomEvent<Snapshot>).detail.lines;
      setLines((old) => (JSON.stringify(old) === JSON.stringify(next) ? old : next));
    };
    window.addEventListener('play-session', update);
    return () => window.removeEventListener('play-session', update);
  }, []);
  useEffect(() => {
    if (follow.current && box.current) box.current.scrollTop = box.current.scrollHeight;
  }, [lines]);
  const messages = lines.filter((line) => /^(› |◆ |.* ▸ )/.test(line));
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
      {messages.length ? (
        messages.map((line, i) => (
          <article key={i} className={line.startsWith('› ') ? 'message user' : 'message assistant'}>
            <span className="message-author">{line.startsWith('› ') ? 'You' : 'gamedev.pl'}</span>
            <p>{line.replace(/^[›◆] /, '')}</p>
          </article>
        ))
      ) : (
        <div className="conversation-welcome">
          <h2>What shall we change?</h2>
          <p>Play a little, then describe your idea or capture a moment. Your game stays open.</p>
        </div>
      )}
    </div>
  );
}
