export const SPLASH_LIVES = 3;
export const MASCOT_HALF = 0.2;
export const CATCH_Y0 = 0.68;
export const CATCH_Y1 = 0.88;
export const KEY_NUDGE = 0.1;
export const MAX_SNACKS = 4;

export const SNACK_ICONS = ['sparkle', 'star', 'gamepad'] as const;
export type SplashSnackKind = 0 | 1 | 2;

export type SplashSnack = {
  id: number;
  x: number;
  y: number;
  vy: number;
  kind: SplashSnackKind;
};

export type SplashGameState = {
  mascotX: number;
  snacks: SplashSnack[];
  score: number;
  lives: number;
  spawnIn: number;
  nextId: number;
  status: 'playing' | 'over';
};

export type SplashTick = {
  state: SplashGameState;
  caught: number;
  missed: number;
};

const clamp = (n: number, min: number, max: number) => Math.min(max, Math.max(min, n));

export function createSplashGame(): SplashGameState {
  return {
    mascotX: 0.5,
    snacks: [],
    score: 0,
    lives: SPLASH_LIVES,
    spawnIn: 0.2,
    nextId: 1,
    status: 'playing',
  };
}

export function setSplashMascotX(state: SplashGameState, x: number): SplashGameState {
  if (state.status !== 'playing') return state;
  return { ...state, mascotX: clamp(x, MASCOT_HALF, 1 - MASCOT_HALF) };
}

export function nudgeSplashMascot(state: SplashGameState, dir: -1 | 1): SplashGameState {
  return setSplashMascotX(state, state.mascotX + dir * KEY_NUDGE);
}

export function spawnInterval(score: number): number {
  return Math.max(0.55, 1.2 - score * 0.022);
}

export function fallSpeed(score: number): number {
  return Math.min(0.72, 0.3 + score * 0.014);
}

function spawnSnack(score: number, nextId: number, rng: () => number): SplashSnack {
  return {
    id: nextId,
    x: MASCOT_HALF + rng() * (1 - 2 * MASCOT_HALF),
    y: -0.06,
    vy: fallSpeed(score),
    kind: Math.floor(rng() * 3) as SplashSnackKind,
  };
}

function inCatchZone(snack: SplashSnack, mascotX: number): boolean {
  return snack.y >= CATCH_Y0 && snack.y <= CATCH_Y1 && Math.abs(snack.x - mascotX) <= MASCOT_HALF;
}

export function tickSplashGame(state: SplashGameState, dt: number, rng: () => number, speed = 1): SplashTick {
  if (state.status !== 'playing') return { state, caught: 0, missed: 0 };
  const step = Math.min(Math.max(dt, 0), 0.05) * Math.max(speed, 0.2);
  let spawnIn = state.spawnIn - step;
  let nextId = state.nextId;
  let score = state.score;
  let lives = state.lives;
  let caught = 0;
  let missed = 0;
  const snacks: SplashSnack[] = [];

  for (const snack of state.snacks) {
    const next = { ...snack, y: snack.y + snack.vy * step };
    if (inCatchZone(next, state.mascotX)) {
      caught += 1;
      score += 1;
      continue;
    }
    if (next.y > CATCH_Y1) {
      missed += 1;
      lives -= 1;
      continue;
    }
    snacks.push(next);
  }

  while (spawnIn <= 0 && snacks.length < MAX_SNACKS && lives > 0) {
    snacks.push(spawnSnack(score, nextId, rng));
    nextId += 1;
    spawnIn += spawnInterval(score);
  }
  if (spawnIn < 0) spawnIn = 0;

  const status = lives <= 0 ? 'over' : 'playing';
  return {
    state: {
      mascotX: state.mascotX,
      snacks: status === 'over' ? [] : snacks,
      score,
      lives: Math.max(0, lives),
      spawnIn,
      nextId,
      status,
    },
    caught,
    missed,
  };
}
