import { StringDecoder } from 'node:string_decoder';
import { useCallback, useEffect, useLayoutEffect, useRef } from 'react';
import { useInput, useStdin, useStdout, type DOMElement, type Key } from 'ink';

export type Wheel = { x: number; y: number; direction: -1 | 1 };
const readers = new WeakMap<NodeJS.ReadStream, number>();

export function mouseDecoder() {
  let pending = '';
  return (input: string): { text: string; wheels: Wheel[]; mouse: boolean } => {
    let rest = pending + input;
    pending = '';
    let text = '';
    let mouse = false;
    const wheels: Wheel[] = [];
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
        const button = rest.charCodeAt(3) - 32;
        const x = rest.charCodeAt(4) - 32;
        const y = rest.charCodeAt(5) - 32;
        if ((button & 0b1100011) === 64 && x > 0 && y > 0) wheels.push({ x, y, direction: -1 });
        else if ((button & 0b1100011) === 65 && x > 0 && y > 0) wheels.push({ x, y, direction: 1 });
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
      const button = Number(match[1]);
      const x = Number(match[2]);
      const y = Number(match[3]);
      if (match[4] === 'M' && (button & 0b1100011) === 64 && x > 0 && y > 0) {
        wheels.push({ x, y, direction: -1 });
      } else if (match[4] === 'M' && (button & 0b1100011) === 65 && x > 0 && y > 0) {
        wheels.push({ x, y, direction: 1 });
      }
      rest = rest.slice(match[0].length);
    }
    return { text, wheels, mouse };
  };
}

export function useTerminalInput(onKey: (input: string, key: Key) => void, onWheel?: (wheel: Wheel) => void) {
  const decode = useRef(mouseDecoder());
  const keyboard = useRef(new StringDecoder('utf8'));
  const rawInput = useRef('');
  const { stdin, internal_eventEmitter: emitter } = useStdin();
  const handlers = useRef({ onKey, onWheel });
  handlers.current = { onKey, onWheel };
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
      const text = keyboard.current.write(Buffer.from(event.mouse ? event.text : input, 'latin1'));
      if (!event.mouse || text) handlers.current.onKey(text, key);
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

export function useMouseReporting(enabled: boolean) {
  const { stdout } = useStdout();
  const { stdin } = useStdin();
  useLayoutEffect(() => {
    if (!enabled || !stdout.isTTY || !stdin.isTTY) return;
    stdout.write('\u001b[?1006h\u001b[?1000h');
    return () => {
      if (!stdout.writableEnded && !stdout.destroyed) stdout.write('\u001b[?1000l\u001b[?1006l');
    };
  }, [enabled, stdin, stdout]);
}

export function wheelInside(element: DOMElement | null, wheel: Wheel, terminalRows: number): boolean {
  if (!element?.yogaNode) return false;
  const { width, height } = element.yogaNode.getComputedLayout();
  let left = 0;
  let top = 0;
  let node: DOMElement | undefined = element;
  let rootHeight = 0;
  while (node) {
    const layout = node.yogaNode?.getComputedLayout();
    left += layout?.left ?? 0;
    top += layout?.top ?? 0;
    rootHeight = layout?.height ?? rootHeight;
    node = node.parentNode;
  }
  top += Math.max(0, terminalRows - rootHeight);
  return wheel.x > left && wheel.x <= left + width && wheel.y > top && wheel.y <= top + height;
}
