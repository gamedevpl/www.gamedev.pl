import type { AssessmentClientContext, AssessmentInputMethod, AssessmentPlatform } from './reviewTypes.js';

export function inferAssessmentPlatform(userAgent: string, maxTouchPoints = 0): AssessmentPlatform {
  const ua = userAgent.toLowerCase();
  // iPadOS 13+ reports as Macintosh but still exposes multi-touch.
  if (/iphone|ipod|ipad/.test(ua) || (/macintosh/.test(ua) && maxTouchPoints > 1)) return 'ios';
  if (/android/.test(ua)) return 'android';
  if (/windows/.test(ua)) return 'windows';
  if (/mac os|macintosh/.test(ua)) return 'mac';
  if (/linux/.test(ua) || /cros/.test(ua)) return 'linux';
  return 'other';
}

export function inferAssessmentInputMethod(input: {
  maxTouchPoints: number;
  coarsePointer: boolean;
  finePointer: boolean;
}): AssessmentInputMethod {
  const { maxTouchPoints, coarsePointer, finePointer } = input;
  if (coarsePointer && finePointer) return 'mixed';
  if (coarsePointer) return 'touch';
  if (finePointer && maxTouchPoints > 0) return 'mixed';
  if (finePointer) return 'mouse';
  if (maxTouchPoints > 0) return 'touch';
  return 'mouse';
}

function clampInt(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min;
  return Math.min(max, Math.max(min, Math.round(value)));
}

function clampDpr(value: number): number {
  if (!Number.isFinite(value) || value <= 0) return 1;
  return Math.min(4, Math.max(0.5, Math.round(value * 100) / 100));
}

export function captureReviewClientContext(
  win: Pick<Window, 'innerWidth' | 'innerHeight' | 'devicePixelRatio' | 'screen' | 'navigator' | 'matchMedia'> = window,
): AssessmentClientContext | null {
  if (typeof win === 'undefined' || !win.navigator) return null;
  const ua = typeof win.navigator.userAgent === 'string' ? win.navigator.userAgent : '';
  const maxTouchPoints = typeof win.navigator.maxTouchPoints === 'number' ? win.navigator.maxTouchPoints : 0;
  // Prefer pointer media queries; fall back to touch points.
  let coarsePointer = maxTouchPoints > 0;
  let finePointer = maxTouchPoints === 0;
  try {
    coarsePointer = win.matchMedia('(pointer: coarse)').matches;
    finePointer = win.matchMedia('(pointer: fine)').matches;
  } catch {
    // Keep the touch-points fallbacks above.
  }

  return {
    viewportW: clampInt(win.innerWidth, 1, 10000),
    viewportH: clampInt(win.innerHeight, 1, 10000),
    screenW: clampInt(win.screen?.width ?? win.innerWidth, 1, 10000),
    screenH: clampInt(win.screen?.height ?? win.innerHeight, 1, 10000),
    dpr: clampDpr(win.devicePixelRatio ?? 1),
    input: inferAssessmentInputMethod({ maxTouchPoints, coarsePointer, finePointer }),
    platform: inferAssessmentPlatform(ua, maxTouchPoints),
    lang: typeof win.navigator.language === 'string' ? win.navigator.language.slice(0, 32) : null,
    ua: ua ? ua.slice(0, 160) : null,
  };
}

export function formatAssessmentClientContext(ctx: AssessmentClientContext | null | undefined): string | null {
  if (!ctx) return null;
  const parts = [
    `${ctx.viewportW}×${ctx.viewportH}`,
    ctx.screenW !== ctx.viewportW || ctx.screenH !== ctx.viewportH ? `screen ${ctx.screenW}×${ctx.screenH}` : null,
    ctx.input,
    ctx.platform,
    ctx.dpr !== 1 ? `dpr ${ctx.dpr}` : null,
    ctx.lang,
  ].filter((part): part is string => Boolean(part));
  return parts.join(' · ');
}
