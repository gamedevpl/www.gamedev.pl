import { describe, expect, it } from 'vitest';
import { isCliAction } from './cli-assistant.js';
describe('CLI action boundary', () => {
  it.each([
    { name: 'play', slug: 'airtime' },
    { name: 'status' },
    { name: 'edit', request: 'Make the jump floatier' },
    { name: 'local', request: 'Resolve pull conflicts' },
  ])('accepts supported arguments: %j', (value) => expect(isCliAction(value)).toBe(true));
  it.each([
    null,
    { name: 'shell' },
    { name: 'play', slug: 'https://evil.test' },
    { name: 'play', slug: '../airtime' },
    { name: 'status', command: 'ls' },
    { name: 'edit' },
    { name: 'edit', request: ' ' },
    { name: 'edit', request: 'x'.repeat(2001) },
    { name: 'local' },
    { name: 'local', request: ' ' },
    { name: 'local', request: 'x'.repeat(2001) },
    { name: 'local', request: 'Resolve conflicts', command: 'rm -rf .' },
  ])('refuses unsupported arguments', (value) => expect(isCliAction(value)).toBe(false));
});
