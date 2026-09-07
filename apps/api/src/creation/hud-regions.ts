import type { HudRegion } from './dream-frames.js';

export const MAX_HUD_REGIONS = 12;
export const MAX_HUD_LABEL_LENGTH = 40;

// Above this share of the frame the game is pure UI.
export const PURE_UI_COVERAGE = 0.7;

// The builder declares `hud` in the capture plan it already writes.
export const HUD_SOURCE_FILE = 'CAPTURE.json';

function finite(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

// Builder-declared rectangles in screenshot pixels; null when nothing was declared.
export function parseHudRegions(raw: unknown, width: number, height: number): HudRegion[] | null {
  if (!Array.isArray(raw)) return null;
  const regions: HudRegion[] = [];
  for (const item of raw) {
    if (!item || typeof item !== 'object') continue;
    const { x, y, w, h, label } = item as Record<string, unknown>;
    if (!finite(x) || !finite(y) || !finite(w) || !finite(h)) continue;
    const left = Math.max(0, Math.min(width, Math.round(x)));
    const top = Math.max(0, Math.min(height, Math.round(y)));
    const right = Math.max(0, Math.min(width, Math.round(x + w)));
    const bottom = Math.max(0, Math.min(height, Math.round(y + h)));
    if (right <= left || bottom <= top) continue;
    const region: HudRegion = { x: left, y: top, w: right - left, h: bottom - top };
    if (typeof label === 'string' && label.trim()) {
      region.label = label.trim().slice(0, MAX_HUD_LABEL_LENGTH);
    }
    regions.push(region);
    if (regions.length >= MAX_HUD_REGIONS) break;
  }
  return regions;
}

// Share of the frame under HUD; overlaps count twice.
export function hudCoverage(regions: readonly HudRegion[], width: number, height: number): number {
  const total = width * height;
  if (total <= 0) return 0;
  const covered = regions.reduce((sum, region) => sum + region.w * region.h, 0);
  return Math.min(1, covered / total);
}

export interface HudRegionsReader {
  (input: { slug: string; version: string; width: number; height: number }): Promise<HudRegion[] | null>;
}

// Reads the delivered CAPTURE.json; null when it declares no HUD.
export function createHudRegionsReader(gamesStore: {
  getSourceFile(slug: string, version: string, path: string): Promise<string | null>;
}): HudRegionsReader {
  return async ({ slug, version, width, height }) => {
    const body = await gamesStore.getSourceFile(slug, version, HUD_SOURCE_FILE);
    if (!body) return null;
    let parsed: unknown;
    try {
      parsed = JSON.parse(body);
    } catch {
      return null;
    }
    if (!parsed || typeof parsed !== 'object') return null;
    return parseHudRegions((parsed as { hud?: unknown }).hud, width, height);
  };
}
