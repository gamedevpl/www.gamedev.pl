export type SheetDetent = 'peek' | 'half' | 'full';

export const SHEET_HALF_VH = 48;
export const SHEET_FULL_VH = 88;
export const SHEET_PEEK_PX = 124;
export const SHEET_DRAG_CLICK_SLOP_PX = 12;

export function nextSheetDetent(current: SheetDetent): SheetDetent {
  if (current === 'peek') return 'half';
  if (current === 'half') return 'full';
  return 'peek';
}

export function snapSheetDetent(heightPx: number, viewportH: number): SheetDetent {
  const peek = Math.min(SHEET_PEEK_PX, Math.max(0, viewportH * 0.9));
  const half = viewportH * (SHEET_HALF_VH / 100);
  const full = viewportH * (SHEET_FULL_VH / 100);
  const dPeek = Math.abs(heightPx - peek);
  const dHalf = Math.abs(heightPx - half);
  const dFull = Math.abs(heightPx - full);
  if (dPeek <= dHalf && dPeek <= dFull) return 'peek';
  if (dHalf <= dFull) return 'half';
  return 'full';
}

export function clampSheetDragHeight(heightPx: number, viewportH: number): number {
  const min = Math.min(SHEET_PEEK_PX, Math.max(0, viewportH * 0.9));
  const max = Math.max(min, viewportH * 0.94);
  return Math.min(max, Math.max(min, heightPx));
}
