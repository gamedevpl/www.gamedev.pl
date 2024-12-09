import { Fireball, FIREBALL_PHYSICS, GameWorldState } from './game-world-types';

/**
 * Calculate the current radius of a fireball based on its growth progress
 */
function calculateCurrentRadius(fireball: Fireball, currentTime: number): number {
  if (currentTime >= fireball.growthEndTime) {
    return fireball.targetRadius;
  }

  const growthProgress = Math.min(1, (currentTime - fireball.createdAt) / FIREBALL_PHYSICS.GROWTH_DURATION);
  // Use smooth interpolation (easeOutQuad) for more natural growth
  const smoothProgress = -(growthProgress * (growthProgress - 2));
  return fireball.targetRadius * smoothProgress;
}

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
 * Update fireball radius based on growth progress
 */
function updateFireballRadius(fireball: Fireball, currentTime: number): void {
  fireball.radius = calculateCurrentRadius(fireball, currentTime);
  // Update mass based on current radius
  fireball.mass = calculateFireballMass(fireball.radius);
}

/**
 * Check if two fireballs are colliding, using their current radii
 */
function areFireballsColliding(f1: Fireball, f2: Fireball, currentTime: number): boolean {
  const dx = f2.x - f1.x;
  const dy = f2.y - f1.y;
  const distance = Math.sqrt(dx * dx + dy * dy);
  
  // Get current radii for both fireballs
  const radius1 = calculateCurrentRadius(f1, currentTime);
  const radius2 = calculateCurrentRadius(f2, currentTime);
  const radiusSum = (radius1 + radius2) * FIREBALL_PHYSICS.COLLISION_THRESHOLD;

  // Calculate relative velocity
  const relativeVx = f2.vx - f1.vx;
  const relativeVy = f2.vy - f1.vy;
  const relativeSpeed = Math.sqrt(relativeVx * relativeVx + relativeVy * relativeVy);

  return distance < radiusSum && relativeSpeed > FIREBALL_PHYSICS.MIN_COLLISION_VELOCITY;
}

/**
 * Merge two fireballs into a new one
 */
function mergeFireballs(f1: Fireball, f2: Fireball, currentTime: number): Fireball {
  // Calculate current volumes based on current radii
  const volume1 = calculateFireballVolume(calculateCurrentRadius(f1, currentTime));
  const volume2 = calculateFireballVolume(calculateCurrentRadius(f2, currentTime));
  const totalVolume = volume1 + volume2;
  
  // Calculate new target radius from combined volume
  const newTargetRadius = calculateRadiusFromVolume(totalVolume * FIREBALL_PHYSICS.MERGE_SIZE_FACTOR);

  // Calculate masses if not already set
  const mass1 = f1.mass ?? calculateFireballMass(calculateCurrentRadius(f1, currentTime));
  const mass2 = f2.mass ?? calculateFireballMass(calculateCurrentRadius(f2, currentTime));
  const totalMass = mass1 + mass2;

  // Calculate new position (weighted by mass)
  const newX = (f1.x * mass1 + f2.x * mass2) / totalMass;
  const newY = (f1.y * mass1 + f2.y * mass2) / totalMass;

  // Calculate new velocity (conservation of momentum)
  const newVx = ((f1.vx * mass1 + f2.vx * mass2) / totalMass) * FIREBALL_PHYSICS.MERGE_MOMENTUM_FACTOR;
  const newVy = ((f1.vy * mass1 + f2.vy * mass2) / totalMass) * FIREBALL_PHYSICS.MERGE_MOMENTUM_FACTOR;

  const now = currentTime;

  // Create new merged fireball
  return {
    id: `merged_${f1.id}_${f2.id}`,
    x: newX,
    y: newY,
    radius: calculateCurrentRadius(f1, currentTime), // Start with current radius of larger fireball
    targetRadius: newTargetRadius,
    growthEndTime: now + FIREBALL_PHYSICS.GROWTH_DURATION,
    vx: newVx,
    vy: newVy,
    createdAt: now,
    mass: totalMass,
    mergeCount: (f1.mergeCount ?? 1) + (f2.mergeCount ?? 1)
  };
}

/**
 * Process all fireball collisions in the game world
 */
function processFireballCollisions(fireballs: Fireball[], currentTime: number): Fireball[] {
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

      if (areFireballsColliding(currentFireball, f2, currentTime)) {
        // Merge the fireballs
        currentFireball = mergeFireballs(currentFireball, f2, currentTime);
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
 * Updates fireball positions, handles growth, and processes collisions
 */
export function updateFireballs(state: GameWorldState, deltaTime: number) {
  const currentTime = state.time;

  // Update positions and radii
  state.fireballs.forEach((fireball) => {
    // Update position
    fireball.x += fireball.vx * deltaTime;
    fireball.y += fireball.vy * deltaTime;

    // Update radius based on growth progress
    updateFireballRadius(fireball, currentTime);
  });

  // Process collisions and merging
  state.fireballs = processFireballCollisions(state.fireballs, currentTime);

  // Filter out fireballs that are out of bounds or too old
  state.fireballs = state.fireballs.filter((fireball) => {
    const isOutOfBounds = fireball.x < 0 || fireball.y < 0;
    const isTooOld = currentTime - fireball.createdAt > 10000; // 10 seconds lifetime

    return !isOutOfBounds && !isTooOld;
  });
}