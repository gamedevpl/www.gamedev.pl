import { describe, expect, it } from 'vitest';
import { healthFor } from './studioHealth.js';
import type { GameHealth } from '../../healthApi.js';
import type { StudioGame } from '../../studioApi.js';

describe('healthFor', () => {
  const rows = [{ slug: 'b' }, { slug: 'a' }] as GameHealth[];

  it('matches on slug', () => {
    expect(healthFor({ slug: 'a' } as StudioGame, rows)).toBe(rows[1]);
  });

  it('has nothing to match without a slug', () => {
    expect(healthFor({} as StudioGame, rows)).toBeNull();
    expect(healthFor({ slug: 'missing' } as StudioGame, rows)).toBeNull();
  });
});
