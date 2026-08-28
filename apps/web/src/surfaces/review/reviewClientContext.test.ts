import { describe, expect, it } from 'vitest';
import {
  formatAssessmentClientContext,
  inferAssessmentInputMethod,
  inferAssessmentPlatform,
} from './reviewClientContext.js';

describe('inferAssessmentPlatform', () => {
  it('recognises iOS, Android, and desktop families', () => {
    expect(inferAssessmentPlatform('Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X)')).toBe('ios');
    expect(inferAssessmentPlatform('Mozilla/5.0 (Linux; Android 14; Pixel 8)')).toBe('android');
    expect(inferAssessmentPlatform('Mozilla/5.0 (Windows NT 10.0; Win64; x64)')).toBe('windows');
    expect(inferAssessmentPlatform('Mozilla/5.0 (Macintosh; Intel Mac OS X 14_0)')).toBe('mac');
    expect(inferAssessmentPlatform('Mozilla/5.0 (X11; Linux x86_64)')).toBe('linux');
  });

  it('treats iPadOS desktop-UA with multi-touch as ios', () => {
    expect(inferAssessmentPlatform('Mozilla/5.0 (Macintosh; Intel Mac OS X 14_0)', 5)).toBe('ios');
  });
});

describe('inferAssessmentInputMethod', () => {
  it('classifies coarse, fine, and dual-input devices', () => {
    expect(inferAssessmentInputMethod({ maxTouchPoints: 5, coarsePointer: true, finePointer: false })).toBe('touch');
    expect(inferAssessmentInputMethod({ maxTouchPoints: 0, coarsePointer: false, finePointer: true })).toBe('mouse');
    expect(inferAssessmentInputMethod({ maxTouchPoints: 5, coarsePointer: true, finePointer: true })).toBe('mixed');
    expect(inferAssessmentInputMethod({ maxTouchPoints: 1, coarsePointer: false, finePointer: true })).toBe('mixed');
  });
});

describe('formatAssessmentClientContext', () => {
  it('renders a compact operator line', () => {
    expect(
      formatAssessmentClientContext({
        viewportW: 390,
        viewportH: 844,
        screenW: 390,
        screenH: 844,
        dpr: 3,
        input: 'touch',
        platform: 'ios',
        lang: 'en-US',
        ua: 'Mozilla/5.0',
      }),
    ).toBe('390×844 · touch · ios · dpr 3 · en-US');
  });

  it('mentions screen when it differs from the viewport', () => {
    expect(
      formatAssessmentClientContext({
        viewportW: 1280,
        viewportH: 720,
        screenW: 1920,
        screenH: 1080,
        dpr: 1,
        input: 'mouse',
        platform: 'windows',
        lang: null,
        ua: null,
      }),
    ).toBe('1280×720 · screen 1920×1080 · mouse · windows');
  });
});
