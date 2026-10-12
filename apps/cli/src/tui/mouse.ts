import { useCallback, useLayoutEffect, useRef } from 'react';
import { useInput, useStdin, useStdout, type DOMElement, type Key } from 'ink';

export type Wheel = { x: number; y: number; direction: -1 | 1 };

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
      const index = rest.search(/\u001b\[<|^\[</);
      if (index < 0) {
        text += rest;
        break;
      }
      mouse = true;
      text += rest.slice(0, index);
      rest = rest.slice(index);
      // eslint-disable-next-line no-control-regex
      const match = /^(?:\u001b)?\[<(\d+);(\d+);(\d+)([Mm])/.exec(rest);
      if (!match) {
        // eslint-disable-next-line no-control-regex
        if (/^(?:\u001b)?\[<[\d;]*$/.test(rest) && rest.length < 64) pending = rest;
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
  const handlers = useRef({ onKey, onWheel });
  handlers.current = { onKey, onWheel };
  useInput(
    useCallback((input, key) => {
      const event = decode.current(input);
      for (const wheel of event.wheels) handlers.current.onWheel?.(wheel);
      if (!event.mouse || event.text) handlers.current.onKey(event.text, key);
    }, []),
  );
}

export function useMouseReporting(enabled: boolean) {
  const { stdout } = useStdout();
  const { stdin } = useStdin();
  useLayoutEffect(() => {
    if (!enabled || !stdout.isTTY || !stdin.isTTY) return;
    stdout.write('\u001b[?1000h\u001b[?1006h');
    return () => {
      if (!stdout.writableEnded && !stdout.destroyed) stdout.write('\u001b[?1006l\u001b[?1000l');
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
