import type { MascotEmotion, MascotLook } from './Mascot.js';

export const STEP_KEYS = ['step1', 'step2', 'step3', 'step4'] as const;
export const STEP_SCENES = ['qa', 'code', 'play', 'live'] as const;
export type StepScene = (typeof STEP_SCENES)[number];

export const STEP_MASCOT: Record<StepScene, { emotion: MascotEmotion; look?: MascotLook }> = {
  qa: { emotion: 'thinking', look: { x: 0.2, y: -0.8 } },
  code: { emotion: 'busy' },
  play: { emotion: 'excited' },
  live: { emotion: 'proud' },
};

export const POKE_REACTION: Record<StepScene, MascotEmotion> = {
  qa: 'curious',
  code: 'busy',
  play: 'happy',
  live: 'wave',
};

export const WIN_REACTION: Record<StepScene, MascotEmotion> = {
  qa: 'excited',
  code: 'excited',
  play: 'excited',
  live: 'proud',
};

export const SPARK_MS = 280;
export const SETTLE_MS = 720;
export const MISS_HOLD_MS = 1400;
export const WIN_HOLD_MS = 1600;
export const GLANCE_EVERY_MS = 7000;

export function chainFrom(index: number): number[] {
  return [0, 1, 2, 3].filter((n) => n >= index);
}

export function applyPoke(comboNext: number, index: number): { comboNext: number; won: boolean; miss: boolean } {
  if (index === comboNext) {
    if (index === 3) return { comboNext: 0, won: true, miss: false };
    return { comboNext: index + 1, won: false, miss: false };
  }
  return { comboNext: 0, won: false, miss: true };
}
