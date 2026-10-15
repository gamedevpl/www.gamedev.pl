import { StringDecoder } from 'node:string_decoder';
import { useCallback, useEffect, useLayoutEffect, useRef } from 'react';
import { useInput, useStdin, useStdout, type DOMElement, type Key } from 'ink';

export type Wheel = { x: number; y: number; direction: -1 | 1 };
export type Pointer = { kind: 'press' | 'drag' | 'release'; x: number; y: number };
export type Rect = { left: number; top: number; width: number; height: number };
const MODIFIERS = 4 | 8 | 16;
const readers = new WeakMap<NodeJS.ReadStream, number>();

export function mouseDecoder() {
  let pending = '';
  return (input: string): { text: string; wheels: Wheel[]; pointers: Pointer[]; mouse: boolean } => {
    let rest = pending + input;
    pending = '';
    let text = '';
    let mouse = false;
    const wheels: Wheel[] = [];
    const pointers: Pointer[] = [];
    const report = (button: number, x: number, y: number, released: boolean) => {
      if (x < 1 || y < 1) return;
      const code = button & 0b1100011;
      if (code === 64 || code === 65) {
        if (!released) wheels.push({ x, y, direction: code === 64 ? -1 : 1 });
        return;
      }
      // Modified drags belong to the terminal's own selection.
      if (button & (64 | MODIFIERS)) return;
      if (released || (button & 3) === 3) pointers.push({ kind: 'release', x, y });
      else if ((button & 3) === 0) pointers.push({ kind: button & 32 ? 'drag' : 'press', x, y });
    };
    while (rest) {
      // eslint-disable-next-line no-control-regex
      const index = rest.search(/\u001b\[<|\u001b\[M/);
      if (index < 0) {
        text += rest;
        break;
      }
      mouse = true;
      text += rest.slice(0, index);
      rest = rest.slice(index);
      if (rest.startsWith('\u001b[M')) {
        if (rest.length < 6) {
          pending = rest;
          break;
        }
        report(rest.charCodeAt(3) - 32, rest.charCodeAt(4) - 32, rest.charCodeAt(5) - 32, false);
        rest = rest.slice(6);
        continue;
      }
      // eslint-disable-next-line no-control-regex
      const match = /^\u001b\[<(\d+);(\d+);(\d+)([Mm])/.exec(rest);
      if (!match) {
        // eslint-disable-next-line no-control-regex
        if (/^\u001b\[<[\d;]*$/.test(rest) && rest.length < 64) pending = rest;
        break;
      }
      report(Number(match[1]), Number(match[2]), Number(match[3]), match[4] === 'm');
      rest = rest.slice(match[0].length);
    }
    return { text, wheels, pointers, mouse };
  };
}

export function useTerminalInput(
  onKey: (input: string, key: Key, raw: string) => void,
  onWheel?: (wheel: Wheel) => void,
  onPointer?: (pointer: Pointer) => void,
) {
  const decode = useRef(mouseDecoder());
  const keyboard = useRef(new StringDecoder('utf8'));
  const rawInput = useRef('');
  const { stdin, internal_eventEmitter: emitter } = useStdin();
  const handlers = useRef({ onKey, onWheel, onPointer });
  handlers.current = { onKey, onWheel, onPointer };
  useLayoutEffect(() => {
    // Ink strips Escape before callbacks; retain it to distinguish pasted text.
    const capture = (data: string) => {
      rawInput.current = data;
    };
    emitter.prependListener('input', capture);
    return () => {
      emitter.off('input', capture);
    };
  }, [emitter]);
  useInput(
    useCallback((input, key) => {
      const event = decode.current(rawInput.current);
      for (const wheel of event.wheels) handlers.current.onWheel?.(wheel);
      for (const pointer of event.pointers) handlers.current.onPointer?.(pointer);
      const control = rawInput.current.replaceAll('\u001b', '');
      if (!event.mouse && rawInput.current.startsWith('\u001b') && control.length >= 2 && control[0] === 'O' && input)
        return;
      const text = keyboard.current.write(Buffer.from(event.mouse ? event.text : input, 'latin1'));
      if (!event.mouse || text) handlers.current.onKey(text, key, event.mouse ? event.text : rawInput.current);
    }, []),
  );
  useEffect(() => {
    readers.set(stdin, (readers.get(stdin) ?? 0) + 1);
    // Preserve legacy coordinate bytes; keyboard text gets its own UTF-8 decoder.
    stdin.setEncoding('latin1');
    return () => {
      const remaining = (readers.get(stdin) ?? 1) - 1;
      if (remaining) readers.set(stdin, remaining);
      else readers.delete(stdin);
      // Ink resets encoding whenever a raw-mode reader mounts or unmounts.
      stdin.setEncoding(remaining ? 'latin1' : 'utf8');
    };
  }, [stdin]);
}

export const MOUSE_ON = '\u001b[?1006h\u001b[?1002h';
export const MOUSE_OFF = '\u001b[?1002l\u001b[?1006l';

export function useMouseReporting(enabled: boolean) {
  const { stdout } = useStdout();
  const { stdin } = useStdin();
  useLayoutEffect(() => {
    if (!enabled || !stdout.isTTY || !stdin.isTTY) return;
    stdout.write(MOUSE_ON);
    const release = () => {
      if (!stdout.writableEnded && !stdout.destroyed) stdout.write(MOUSE_OFF);
    };
    process.once('exit', release);
    return () => {
      process.off('exit', release);
      release();
    };
  }, [enabled, stdin, stdout]);
}

// The workspace draws from the top row of the alternate screen.
export function elementRect(element: DOMElement | null): Rect | null {
  if (!element?.yogaNode) return null;
  const { width, height } = element.yogaNode.getComputedLayout();
  let left = 1;
  let top = 1;
  for (let node: DOMElement | undefined = element; node; node = node.parentNode) {
    const layout = node.yogaNode?.getComputedLayout();
    left += layout?.left ?? 0;
    top += layout?.top ?? 0;
  }
  return { left, top, width, height };
}

export function inside(rect: Rect | null, x: number, y: number): boolean {
  return Boolean(rect && x >= rect.left && x < rect.left + rect.width && y >= rect.top && y < rect.top + rect.height);
}

export function wheelInside(element: DOMElement | null, wheel: Wheel): boolean {
  return inside(elementRect(element), wheel.x, wheel.y);
}
