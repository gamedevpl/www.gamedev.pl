import { expect, it } from 'vitest';
import { mouseDecoder } from './mouse.js';

it('decodes wheel directions and modifiers and discards mouse clicks, releases and horizontal scroll', () => {
  const decode = mouseDecoder();
  expect(decode('\u001b[<64;10;5M\u001b[<65;20;6M\u001b[<68;10;5M').wheels).toEqual([
    { x: 10, y: 5, direction: -1 },
    { x: 20, y: 6, direction: 1 },
    { x: 10, y: 5, direction: -1 },
  ]);
  expect(decode('[<0;1;2M\u001b[<0;1;2m\u001b[<66;1;2M')).toEqual({ text: '', mouse: true, wheels: [] });
});

it('buffers fragmented reports without exposing their coordinates as text', () => {
  const decode = mouseDecoder();
  expect(decode('[<64;')).toEqual({ text: '', mouse: true, wheels: [] });
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
  expect(decode('[<64;0;5M').wheels).toEqual([]);
});
