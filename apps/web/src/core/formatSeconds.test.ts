import { describe, expect, it } from 'vitest';
import { formatSeconds } from './formatSeconds.js';

describe('formatSeconds', () => {
  it('renders sub-minute durations as seconds', () => {
    expect(formatSeconds(0)).toBe('0s');
    expect(formatSeconds(42)).toBe('42s');
  });

  it('rounds sub-minute durations to whole seconds', () => {
    expect(formatSeconds(59.6)).toBe('1m');
  });

  it('renders whole minutes without a seconds component', () => {
    expect(formatSeconds(120)).toBe('2m');
  });

  it('renders minutes and seconds', () => {
    expect(formatSeconds(125)).toBe('2m 5s');
  });

  it('rounds the total before splitting, never carrying an impossible seconds value', () => {
    expect(formatSeconds(119.6)).toBe('2m');
    expect(formatSeconds(3599.7)).toBe('60m');
  });
});
