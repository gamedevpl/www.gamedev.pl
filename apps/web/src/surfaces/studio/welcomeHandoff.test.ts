import { describe, expect, it } from 'vitest';
import { studioPlaytestPath, welcomeHandoffHref } from './welcomeHandoff.js';

describe('welcomeHandoffHref', () => {
  it('opens playtest when the draft is ready', () => {
    expect(welcomeHandoffHref('bastion-wave', true)).toBe('/studio/bastion-wave/playtest?from=handoff');
    expect(studioPlaytestPath('a b')).toBe('/studio/a%20b/playtest');
  });

  it('opens the thread while the agent is still building', () => {
    expect(welcomeHandoffHref('bastion-wave', false)).toBe('/studio/bastion-wave?from=handoff');
  });
});
