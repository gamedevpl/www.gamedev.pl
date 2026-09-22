import { useEffect, useRef, useState } from 'react';
import { lineStyle, type LineStyle } from '../src/transcript-style.js';
import { isMascotLine } from '../src/tui/mascot.js';

const TOKEN = /(`[^`\n]+`|https?:\/\/[^\s<>"'`]+|\/[a-z][\w-]*\b)/g;
const SEVERITY: Record<string, number> = { red: 3, yellow: 2, green: 1 };

export function RichText({ text }: { text: string }) {
  return (
    <>
      {text.split(TOKEN).map((part, index) => {
        if (index % 2 === 0) return part;
        if (part.startsWith('`')) return <code key={index}>{part.slice(1, -1)}</code>;
        if (/^https?:\/\//.test(part))
          return (
            <a key={index} href={part} target="_blank" rel="noopener noreferrer">
              {part}
            </a>
          );
        return (
          <span key={index} className="tl-command">
            {part}
          </span>
        );
      })}
    </>
  );
}

export function TranscriptRow({ line, previous }: { line: string; previous?: string }) {
  if (isMascotLine(line)) return null;
  const style = lineStyle(line);
  const agent = /^([\w-]+)( ▸ | · )/.exec(line);
  const sameSpeaker = agent && previous?.startsWith(`${agent[1]} ▸ `) && line.includes(' ▸ ') && !style.quiet;
  const spaced = style.space || (agent && !sameSpeaker && !style.quiet);
  const className = ['tl', style.tone && `tone-${style.tone}`, style.quiet && 'quiet', spaced && 'spaced']
    .filter(Boolean)
    .join(' ');
  return (
    <div className={className}>
      <span className="tl-label" aria-hidden={style.label.trim() ? undefined : true}>
        {style.label}
      </span>
      <span className="tl-text">
        {agent ? (
          <>
            <b className="tl-author">{agent[1]}</b>
            {agent[2]}
            <RichText text={line.slice(agent[0].length)} />
          </>
        ) : (
          <RichText text={line} />
        )}
      </span>
    </div>
  );
}

export function TranscriptLines({ lines }: { lines: string[] }) {
  return (
    <div className="transcript-lines">
      {lines.map((line, i) => (
        <TranscriptRow key={i} line={line} previous={lines[i - 1]} />
      ))}
    </div>
  );
}

// Most urgent line, so collapsed summaries still surface failures.
export function headline(lines: string[]): { line: string; style: LineStyle } {
  let best = { line: lines[0] ?? '', style: lineStyle(lines[0] ?? '') };
  for (const line of lines) {
    const style = lineStyle(line);
    if ((SEVERITY[style.tone ?? ''] ?? 0) > (SEVERITY[best.style.tone ?? ''] ?? 0)) best = { line, style };
  }
  return best;
}

export function SessionOutput() {
  const [lines, setLines] = useState<string[]>([]);
  const { box, onScroll } = useFollowScroll(lines);
  useEffect(() => {
    const update = (event: Event) => {
      const next = (event as CustomEvent<{ lines: string[] }>).detail.lines;
      setLines((old) => (old.length === next.length && old.every((line, i) => line === next[i]) ? old : next));
    };
    window.addEventListener('play-session', update);
    return () => window.removeEventListener('play-session', update);
  }, []);
  return (
    <div id="transcript" ref={box} tabIndex={0} aria-label="Session output" onScroll={onScroll}>
      <TranscriptLines lines={lines} />
    </div>
  );
}

// Pins to the newest line unless scrolled up; re-pins when shown.
export function useFollowScroll(content: unknown, slack = 30) {
  const box = useRef<HTMLDivElement>(null);
  const follow = useRef(true);
  const pin = () => {
    if (follow.current && box.current) box.current.scrollTop = box.current.scrollHeight;
  };
  useEffect(pin, [content]);
  useEffect(() => {
    if (!box.current || typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(pin);
    observer.observe(box.current);
    return () => observer.disconnect();
  }, []);
  const onScroll = () => {
    const node = box.current!;
    if (node.clientHeight) follow.current = node.scrollTop + node.clientHeight >= node.scrollHeight - slack;
  };
  return { box, onScroll };
}
