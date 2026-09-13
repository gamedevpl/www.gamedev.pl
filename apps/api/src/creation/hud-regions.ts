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

// Share of the frame under HUD, counting overlapped pixels once.
export function hudCoverage(regions: readonly HudRegion[], width: number, height: number): number {
  const total = width * height;
  if (total <= 0 || regions.length === 0) return 0;
  // A panel and the labels inside it are one area, not two.
  const xs = [...new Set(regions.flatMap((region) => [region.x, region.x + region.w]))].sort((a, b) => a - b);
  const ys = [...new Set(regions.flatMap((region) => [region.y, region.y + region.h]))].sort((a, b) => a - b);
  let covered = 0;
  for (let column = 0; column + 1 < xs.length; column += 1) {
    const left = xs[column]!;
    const right = xs[column + 1]!;
    for (let row = 0; row + 1 < ys.length; row += 1) {
      const top = ys[row]!;
      const bottom = ys[row + 1]!;
      const inside = regions.some(
        (region) =>
          region.x <= left && right <= region.x + region.w && region.y <= top && bottom <= region.y + region.h,
      );
      if (inside) covered += (right - left) * (bottom - top);
    }
  }
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
