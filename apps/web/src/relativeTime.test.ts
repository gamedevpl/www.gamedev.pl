import { describe, expect, it } from 'vitest';
import { formatSeconds } from './relativeTime.js';

describe('formatSeconds', () => {
  it('renders sub-minute durations in seconds', () => {
    expect(formatSeconds(0)).toBe('0s');
    expect(formatSeconds(45)).toBe('45s');
  });

  it('rolls a rounded remainder into the minute', () => {
    expect(formatSeconds(59.6)).toBe('1m');
    expect(formatSeconds(119.6)).toBe('2m');
    expect(formatSeconds(3599.7)).toBe('60m');
  });

  it('drops a zero remainder', () => {
    expect(formatSeconds(60)).toBe('1m');
    expect(formatSeconds(90.4)).toBe('1m 30s');
  });
});
