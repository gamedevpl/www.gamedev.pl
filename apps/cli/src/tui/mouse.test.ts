import { expect, it } from 'vitest';
import { mouseDecoder } from './mouse.js';

it('decodes wheel directions and modifiers and discards mouse clicks, releases and horizontal scroll', () => {
  const decode = mouseDecoder();
  expect(decode('\u001b[<64;10;5M\u001b[<65;20;6M\u001b[<68;10;5M').wheels).toEqual([
    { x: 10, y: 5, direction: -1 },
    { x: 20, y: 6, direction: 1 },
    { x: 10, y: 5, direction: -1 },
  ]);
  expect(decode('\u001b[<0;1;2M\u001b[<0;1;2m\u001b[<66;1;2M')).toEqual({ text: '', mouse: true, wheels: [] });
});

it('buffers fragmented reports without exposing their coordinates as text', () => {
  const decode = mouseDecoder();
  expect(decode('\u001b[<64;')).toEqual({ text: '', mouse: true, wheels: [] });
  expect(decode('10;')).toEqual({ text: '', mouse: true, wheels: [] });
  expect(decode('5M')).toEqual({ text: '', mouse: true, wheels: [{ x: 10, y: 5, direction: -1 }] });
  expect(decode('normal paste')).toEqual({ text: 'normal paste', mouse: false, wheels: [] });
});

it('preserves text beside reports and rejects invalid coordinates', () => {
  const decode = mouseDecoder();
  expect(decode('before\u001b[<65;10;5Mafter')).toEqual({
    text: 'beforeafter',
    mouse: true,
    wheels: [{ x: 10, y: 5, direction: 1 }],
  });
  expect(decode('\u001b[<64;0;5M').wheels).toEqual([]);
});

it.each(['[<T>() => T]', '[<64;', '[<64;10;5M', '[MABC'])('preserves literal pasted prefixes: %s', (paste) => {
  expect(mouseDecoder()(paste)).toEqual({ text: paste, mouse: false, wheels: [] });
});

it('decodes legacy wheel reports and discards legacy clicks, releases and horizontal scroll', () => {
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
  });
  expect(decode(report(0) + report(3) + report(66))).toEqual({ text: '', mouse: true, wheels: [] });
});

it('buffers a legacy report split within its payload and preserves adjacent text', () => {
  const decode = mouseDecoder();
  expect(decode('\u001b[M`')).toEqual({ text: '', mouse: true, wheels: [] });
  expect(decode('*')).toEqual({ text: '', mouse: true, wheels: [] });
  expect(decode('%after')).toEqual({ text: 'after', mouse: true, wheels: [{ x: 10, y: 5, direction: -1 }] });
});
