import { Fireball, FIREBALL_PHYSICS, GameWorldState } from './game-world-types';

/**
 * Calculate the volume of a fireball based on its radius
 */
function calculateFireballVolume(radius: number): number {
  return (4 / 3) * Math.PI * Math.pow(radius, 3);
}

/**
 * Calculate radius from volume
 */
function calculateRadiusFromVolume(volume: number): number {
  return Math.pow((3 * volume) / (4 * Math.PI), 1/3);
}

/**
 * Calculate mass of a fireball (proportional to volume)
 */
function calculateFireballMass(radius: number): number {
  return calculateFireballVolume(radius);
}

/**
 * Check if two fireballs are colliding
 */
function areFireballsColliding(f1: Fireball, f2: Fireball): boolean {
  const dx = f2.x - f1.x;
  const dy = f2.y - f1.y;
  const distance = Math.sqrt(dx * dx + dy * dy);
  const radiusSum = (f1.radius + f2.radius) * FIREBALL_PHYSICS.COLLISION_THRESHOLD;

  // Calculate relative velocity
  const relativeVx = f2.vx - f1.vx;
  const relativeVy = f2.vy - f1.vy;
  const relativeSpeed = Math.sqrt(relativeVx * relativeVx + relativeVy * relativeVy);

  return distance < radiusSum && relativeSpeed > FIREBALL_PHYSICS.MIN_COLLISION_VELOCITY;
}

/**
 * Merge two fireballs into a new one
 */
function mergeFireballs(f1: Fireball, f2: Fireball): Fireball {
  // Calculate combined volume and new radius
  const totalVolume = calculateFireballVolume(f1.radius) + calculateFireballVolume(f2.radius);
  const newRadius = calculateRadiusFromVolume(totalVolume * FIREBALL_PHYSICS.MERGE_SIZE_FACTOR);

  // Calculate masses if not already set
  const mass1 = f1.mass ?? calculateFireballMass(f1.radius);
  const mass2 = f2.mass ?? calculateFireballMass(f2.radius);
  const totalMass = mass1 + mass2;

  // Calculate new position (weighted by mass)
  const newX = (f1.x * mass1 + f2.x * mass2) / totalMass;
  const newY = (f1.y * mass1 + f2.y * mass2) / totalMass;

  // Calculate new velocity (conservation of momentum)
  const newVx = ((f1.vx * mass1 + f2.vx * mass2) / totalMass) * FIREBALL_PHYSICS.MERGE_MOMENTUM_FACTOR;
  const newVy = ((f1.vy * mass1 + f2.vy * mass2) / totalMass) * FIREBALL_PHYSICS.MERGE_MOMENTUM_FACTOR;

  // Create new merged fireball
  return {
    id: `merged_${f1.id}_${f2.id}`,
    x: newX,
    y: newY,
    radius: newRadius,
    vx: newVx,
    vy: newVy,
    createdAt: Math.max(f1.createdAt, f2.createdAt),
    mass: totalMass,
    mergeCount: (f1.mergeCount ?? 1) + (f2.mergeCount ?? 1)
  };
}

/**
 * Process all fireball collisions in the game world
 */
function processFireballCollisions(fireballs: Fireball[]): Fireball[] {
  const processedFireballs = new Set<string>();
  const newFireballs: Fireball[] = [];

  for (let i = 0; i < fireballs.length; i++) {
    const f1 = fireballs[i];
    
    // Skip if this fireball was already processed
    if (processedFireballs.has(f1.id)) continue;

    let currentFireball = f1;
    let hasMerged = false;

    for (let j = i + 1; j < fireballs.length; j++) {
      const f2 = fireballs[j];
      
      // Skip if this fireball was already processed
      if (processedFireballs.has(f2.id)) continue;

      if (areFireballsColliding(currentFireball, f2)) {
        // Merge the fireballs
        currentFireball = mergeFireballs(currentFireball, f2);
        processedFireballs.add(f2.id);
        hasMerged = true;
      }
    }

    if (hasMerged) {
      processedFireballs.add(f1.id);
      newFireballs.push(currentFireball);
    } else if (!processedFireballs.has(f1.id)) {
      newFireballs.push(f1);
    }
  }

  return newFireballs;
}

/**
 * Updates fireball positions and handles collisions
 */
export function updateFireballs(state: GameWorldState, deltaTime: number) {
  // First update positions
  state.fireballs.forEach((fireball) => {
    fireball.x += fireball.vx * deltaTime;
    fireball.y += fireball.vy * deltaTime;
  });

  // Process collisions and merging
  state.fireballs = processFireballCollisions(state.fireballs);

  // Filter out fireballs that are out of bounds or too old
  state.fireballs = state.fireballs.filter((fireball) => {
    const isOutOfBounds = fireball.x < 0 || fireball.y < 0;
    const isTooOld = state.time - fireball.createdAt > 10000; // 10 seconds lifetime

    return !isOutOfBounds && !isTooOld;
  });
}