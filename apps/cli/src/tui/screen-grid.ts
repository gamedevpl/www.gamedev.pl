import { spawn } from 'node:child_process';
import { stripVTControlCharacters } from 'node:util';

export type Frame = { raw: string[]; plain: string[] };

const graphemes = new Intl.Segmenter(undefined, { granularity: 'grapheme' });
const WIDE = /\p{Extended_Pictographic}|[ᄀ-ᅟ⺀-꓏가-힣豈-﫿︰-﹏＀-｠￠-￦]|[\u{20000}-\u{3fffd}]/u;
// eslint-disable-next-line no-control-regex
const CURSOR_PREFIX = /^(?:\u001b\[[0-9;]*[A-HJK])+/;

// Ink writes whole frames; the newest full-height one is the screen.
export function frameOf(chunk: string, rows: number): Frame | null {
  const lines = chunk.split('\n');
  if (lines.at(-1) === '') lines.pop();
  if (rows < 1 || lines.length < rows) return null;
  const raw = lines.slice(-rows).map((line) => line.replace(CURSOR_PREFIX, ''));
  return { raw, plain: raw.map((line) => stripVTControlCharacters(line)) };
}

// One entry per terminal column; wide characters leave an empty continuation.
export function cells(line: string): string[] {
  const result: string[] = [];
  for (const { segment } of graphemes.segment(line)) {
    result.push(segment);
    if (WIDE.test(segment)) result.push('');
  }
  return result;
}

export function columnText(line: string, from: number, to: number): string {
  return cells(line)
    .slice(Math.max(0, from - 1), Math.max(0, to))
    .join('');
}

export function wordAt(line: string, column: number): [number, number] | null {
  const row = cells(line);
  const word = (index: number) => /[\p{L}\p{N}_\-./:@~#%+=?&]/u.test(row[index] ?? ' ');
  let start = column - 1;
  if (!word(start)) return null;
  let end = start;
  while (start > 0 && (word(start - 1) || row[start - 1] === '')) start--;
  while (end + 1 < row.length && (word(end + 1) || row[end + 1] === '')) end++;
  return [start + 1, end + 1];
}

// A soft gray, like Claude Code, instead of full inversion.
export const SELECTED = '\u001b[0;48;5;245;38;5;231m';

export function highlight(frame: Frame, y: number, from: number, to: number): string {
  const text = columnText(frame.plain[y - 1] ?? '', from, to).trimEnd();
  return text ? `\u001b[${y};${from}H${SELECTED}${text}\u001b[0m` : '';
}

export function repaint(frame: Frame, y: number): string {
  return `\u001b[${y};1H\u001b[0m${frame.raw[y - 1] ?? ''}\u001b[0m\u001b[K`;
}

export const OSC52_LIMIT = 100_000;

export function osc52(text: string, tmux = Boolean(process.env.TMUX)): string | null {
  const encoded = Buffer.from(text, 'utf8').toString('base64');
  if (encoded.length > OSC52_LIMIT) return null;
  const sequence = `\u001b]52;c;${encoded}\u0007`;
  return tmux ? `\u001bPtmux;${sequence.replaceAll('\u001b', '\u001b\u001b')}\u001b\\` : sequence;
}

// Terminal.app ignores OSC 52, so local macOS sessions use pbcopy.
export function systemClipboard(text: string, write: (data: string) => void): boolean {
  const local = !process.env.SSH_CONNECTION && !process.env.SSH_TTY;
  if (process.platform === 'darwin' && local) {
    const child = spawn('pbcopy', { stdio: ['pipe', 'ignore', 'ignore'] });
    child.on('error', () => {
      const sequence = osc52(text);
      if (sequence) write(sequence);
    });
    child.stdin.end(text);
    return true;
  }
  const sequence = osc52(text);
  if (sequence) write(sequence);
  return Boolean(sequence);
}
