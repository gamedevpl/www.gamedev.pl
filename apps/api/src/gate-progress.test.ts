import { describe, expect, it } from 'vitest';
import {
  createGateStageBannerParser,
  gateProgressChecklistIndex,
  gateProgressFor,
  parseGateStageBanner,
  stagesForLane,
} from './gate-progress.js';

describe('gate progress', () => {
  it('builds index/total from the lane stage list', () => {
    const preview = gateProgressFor('preview', 'smoke', '2026-08-07T12:00:00.000Z');
    expect(preview).toMatchObject({
      lane: 'preview',
      stage: 'smoke',
      index: stagesForLane('preview').indexOf('smoke'),
      total: stagesForLane('preview').length,
    });
    expect(gateProgressFor('publish', 'validate').total).toBe(stagesForLane('publish').length);
  });

  it('parses check:game stage banners', () => {
    expect(parseGateStageBanner('\n=== typecheck (comet) ===\n')).toBe('typecheck');
    expect(parseGateStageBanner('=== agent-play (x) ===')).toBe('agent-play');
    expect(parseGateStageBanner('no banner here')).toBeNull();
  });

  it('streams banners across chunk boundaries once per stage', () => {
    const seen: string[] = [];
    const feed = createGateStageBannerParser((stage) => seen.push(stage));
    feed('\n=== type');
    feed('check (slug) ===\nnoise\n=== smoke (slug) ===\n');
    feed('=== smoke (slug) ===\n'); // duplicate ignored
    expect(seen).toEqual(['typecheck', 'smoke']);
  });

  it('maps stages onto the short Studio/mcp checklist', () => {
    expect(gateProgressChecklistIndex('preparing', 'publish')).toBe(-1);
    expect(gateProgressChecklistIndex('typecheck', 'preview')).toBe(0);
    expect(gateProgressChecklistIndex('playtest', 'publish')).toBe(5); // validate slot
  });
});
