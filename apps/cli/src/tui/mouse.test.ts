import { expect, it } from 'vitest';
import { mouseDecoder } from './mouse.js';

it('decodes wheel directions and modifiers and discards horizontal scroll', () => {
  const decode = mouseDecoder();
  expect(decode('\u001b[<64;10;5M\u001b[<65;20;6M\u001b[<68;10;5M').wheels).toEqual([
    { x: 10, y: 5, direction: -1 },
    { x: 20, y: 6, direction: 1 },
    { x: 10, y: 5, direction: -1 },
  ]);
  expect(decode('\u001b[<66;1;2M\u001b[<64;1;2m')).toEqual({ text: '', mouse: true, wheels: [], pointers: [] });
});

it('buffers fragmented reports without exposing their coordinates as text', () => {
  const decode = mouseDecoder();
  expect(decode('\u001b[<64;')).toEqual({ text: '', mouse: true, wheels: [], pointers: [] });
  expect(decode('10;')).toEqual({ text: '', mouse: true, wheels: [], pointers: [] });
  expect(decode('5M')).toEqual({ text: '', mouse: true, wheels: [{ x: 10, y: 5, direction: -1 }], pointers: [] });
  expect(decode('normal paste')).toEqual({ text: 'normal paste', mouse: false, wheels: [], pointers: [] });
});

it('preserves text beside reports and rejects invalid coordinates', () => {
  const decode = mouseDecoder();
  expect(decode('before\u001b[<65;10;5Mafter')).toEqual({
    text: 'beforeafter',
    mouse: true,
    wheels: [{ x: 10, y: 5, direction: 1 }],
    pointers: [],
  });
  expect(decode('\u001b[<64;0;5M').wheels).toEqual([]);
});

it.each(['[<T>() => T]', '[<64;', '[<64;10;5M', '[MABC'])('preserves literal pasted prefixes: %s', (paste) => {
  expect(mouseDecoder()(paste)).toEqual({ text: paste, mouse: false, wheels: [], pointers: [] });
});

it('decodes legacy wheel and left-button reports and discards horizontal scroll and modified clicks', () => {
  const report = (button: number) => '\u001b[M' + String.fromCharCode(button + 32, 42, 37);
  const decode = mouseDecoder();
  expect(decode(report(64) + report(65) + report(68))).toEqual({
    text: '',
    mouse: true,
    wheels: [
      { x: 10, y: 5, direction: -1 },
      { x: 10, y: 5, direction: 1 },
      { x: 10, y: 5, direction: -1 },
    ],
    pointers: [],
  });
  expect(decode(report(0) + report(32) + report(3) + report(66) + report(4))).toEqual({
    text: '',
    mouse: true,
    wheels: [],
    pointers: [
      { kind: 'press', x: 10, y: 5 },
      { kind: 'drag', x: 10, y: 5 },
      { kind: 'release', x: 10, y: 5 },
    ],
  });
});

it('buffers a legacy report split within its payload and preserves adjacent text', () => {
  const decode = mouseDecoder();
  expect(decode('\u001b[M`')).toEqual({ text: '', mouse: true, wheels: [], pointers: [] });
  expect(decode('*')).toEqual({ text: '', mouse: true, wheels: [], pointers: [] });
  expect(decode('%after')).toEqual({
    text: 'after',
    mouse: true,
    wheels: [{ x: 10, y: 5, direction: -1 }],
    pointers: [],
  });
});

it('decodes left-button press, drag and release and leaves modified drags to the terminal', () => {
  const decode = mouseDecoder();
  expect(decode('\u001b[<0;3;4M\u001b[<32;5;4M\u001b[<0;6;4m').pointers).toEqual([
    { kind: 'press', x: 3, y: 4 },
    { kind: 'drag', x: 5, y: 4 },
    { kind: 'release', x: 6, y: 4 },
  ]);
  expect(decode('\u001b[<4;3;4M\u001b[<40;5;4M\u001b[<2;5;4M\u001b[<16;6;4m').pointers).toEqual([]);
});
