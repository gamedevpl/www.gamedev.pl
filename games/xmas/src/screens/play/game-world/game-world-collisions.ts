import { Fireball, FIREBALL_PHYSICS, Santa } from './game-world-types';

/**
 * Calculate the effective collision radius of a fireball based on its growth state
 */
export function calculateEffectiveCollisionRadius(fireball: Fireball): number {
  const growthProgress = Math.min(1, (Date.now() - fireball.createdAt) / FIREBALL_PHYSICS.GROWTH_DURATION);

  // Only start collision detection after growth threshold
  if (growthProgress < FIREBALL_PHYSICS.COLLISION_GROWTH_THRESHOLD) {
    return 0;
  }

  // Scale the collision radius based on growth progress
  const visualRadius = fireball.radius;
  const collisionRadius = visualRadius * FIREBALL_PHYSICS.COLLISION_VISUAL_SCALE;

  return collisionRadius * FIREBALL_PHYSICS.COLLISION_MARGIN;
}

/**
 * Calculate collision sensitivity based on distance from fireball center
 */
export function calculateCollisionSensitivity(normalizedDistance: number): number {
  // Use a power curve to create progressive sensitivity
  const sensitivity = Math.pow(1 - Math.min(1, normalizedDistance), FIREBALL_PHYSICS.COLLISION_SENSITIVITY_CURVE);

  return (
    FIREBALL_PHYSICS.COLLISION_SENSITIVITY_MIN +
    (FIREBALL_PHYSICS.COLLISION_SENSITIVITY_MAX - FIREBALL_PHYSICS.COLLISION_SENSITIVITY_MIN) * sensitivity
  );
}

/**
 * Check if a fireball hits a Santa with progressive collision sensitivity
 */
export function checkFireballSantaCollision(fireball: Fireball, santa: Santa): boolean {
  // Early exit if fireball is too new (still growing)
  const growthProgress = (Date.now() - fireball.createdAt) / FIREBALL_PHYSICS.GROWTH_DURATION;
  if (growthProgress < FIREBALL_PHYSICS.COLLISION_GROWTH_THRESHOLD) {
    return false;
  }

  const dx = santa.x - fireball.x;
  const dy = santa.y - fireball.y;
  const distanceSquared = dx * dx + dy * dy;

  // Early exit for obvious non-collisions using squared distance
  const collisionRadius = calculateEffectiveCollisionRadius(fireball);
  const maxCollisionDistanceSquared = collisionRadius * collisionRadius;

  if (distanceSquared > maxCollisionDistanceSquared) {
    return false;
  }

  // Calculate actual distance only if potentially colliding
  const distance = Math.sqrt(distanceSquared);
  const normalizedDistance = distance / collisionRadius;

  // Apply progressive sensitivity
  const sensitivity = calculateCollisionSensitivity(normalizedDistance);

  return normalizedDistance < sensitivity;
}

/**
 * Calculate the pushback force with improved distance-based scaling
 */
export function calculatePushbackForce(fireball: Fireball, distance: number): number {
  const collisionRadius = calculateEffectiveCollisionRadius(fireball);
  const normalizedDistance = Math.max(0.1, distance / collisionRadius);

  // Calculate base force with smoother falloff
  const baseForce =
    FIREBALL_PHYSICS.PUSHBACK_BASE_FORCE + fireball.targetRadius * FIREBALL_PHYSICS.PUSHBACK_RADIUS_MULTIPLIER;

  // Use smoother distance falloff
  const distanceFactor = 1 / Math.pow(normalizedDistance, FIREBALL_PHYSICS.PUSHBACK_DISTANCE_FACTOR);

  // Calculate final force with clamping
  const force = baseForce * distanceFactor;
  return Math.min(FIREBALL_PHYSICS.PUSHBACK_MAX_FORCE, Math.max(FIREBALL_PHYSICS.PUSHBACK_MIN_FORCE, force));
}

/**
 * Calculate the pushback vector with momentum transfer
 */
export function calculatePushbackVector(fireball: Fireball, santa: Santa): { vx: number; vy: number } {
  const dx = santa.x - fireball.x;
  const dy = santa.y - fireball.y;
  const distance = Math.sqrt(dx * dx + dy * dy);

  // Normalize direction vector
  const nx = dx / distance;
  const ny = dy / distance;

  // Calculate force and basic pushback
  const force = calculatePushbackForce(fireball, distance);

  // Calculate momentum transfer
  const momentumVx = fireball.vx * FIREBALL_PHYSICS.MOMENTUM_TRANSFER_RATE;
  const momentumVy = fireball.vy * FIREBALL_PHYSICS.MOMENTUM_TRANSFER_RATE;

  // Combine direct force and momentum transfer
  const vx = (nx * force + momentumVx) * FIREBALL_PHYSICS.VELOCITY_DAMPENING;
  const vy = (ny * force + momentumVy) * FIREBALL_PHYSICS.VELOCITY_DAMPENING;

  return { vx, vy };
}

/**
 * Clamp velocity components with improved smoothing
 */
export function clampVelocity(vx: number, vy: number): { vx: number; vy: number } {
  const speed = Math.sqrt(vx * vx + vy * vy);
  if (speed > FIREBALL_PHYSICS.MAX_PUSHBACK_VELOCITY) {
    // Apply smooth clamping
    const scale = FIREBALL_PHYSICS.MAX_PUSHBACK_VELOCITY / speed;
    return {
      vx: vx * scale,
      vy: vy * scale,
    };
  }
  return { vx, vy };
}

/**
 * Handle collision between a fireball and Santa with improved physics
 */
export function handleFireballSantaCollision(fireball: Fireball, santa: Santa): void {
  // Calculate pushback vector with momentum transfer
  const pushback = calculatePushbackVector(fireball, santa);

  // Apply smooth velocity clamping
  const clampedVelocity = clampVelocity(santa.vx + pushback.vx, santa.vy + pushback.vy);

  // Update Santa's velocity
  santa.vx = clampedVelocity.vx;
  santa.vy = clampedVelocity.vy;

  // Calculate energy reduction based on collision impact
  const impactSpeed = Math.sqrt(pushback.vx * pushback.vx + pushback.vy * pushback.vy);
  const energyReduction = Math.min(
    santa.energy,
    fireball.targetRadius * 0.5 * (impactSpeed / FIREBALL_PHYSICS.MAX_PUSHBACK_VELOCITY),
  );

  // Apply energy reduction
  santa.energy = Math.max(0, santa.energy - energyReduction);
  santa.energyRegenPaused = true;
}

/**
 * Calculate the current radius of a fireball based on its growth progress
 * with improved interpolation and collision consistency
 */
export function calculateCurrentRadius(fireball: Fireball, currentTime: number): number {
  // Early return if growth is complete
  if (currentTime >= fireball.growthEndTime) {
    return fireball.targetRadius;
  }

  // Calculate basic growth progress
  const growthProgress = Math.min(1, (currentTime - fireball.createdAt) / FIREBALL_PHYSICS.GROWTH_DURATION);

  // Don't allow collision detection before growth threshold
  if (growthProgress < FIREBALL_PHYSICS.COLLISION_GROWTH_THRESHOLD) {
    return fireball.targetRadius * growthProgress; // Visual size only
  }

  // Use smooth interpolation (easeOutQuad) for more natural growth
  const smoothProgress = -(growthProgress * (growthProgress - 2));

  // Calculate the actual radius
  const currentRadius = fireball.targetRadius * smoothProgress;

  // Apply collision margin for consistent collision detection
  return currentRadius * FIREBALL_PHYSICS.COLLISION_VISUAL_SCALE;
}

/**
 * Calculate the volume of a fireball based on its radius
 */
export function calculateFireballVolume(radius: number): number {
  return (4 / 3) * Math.PI * Math.pow(radius, 3);
}

/**
 * Calculate radius from volume with collision scaling
 */
export function calculateRadiusFromVolume(volume: number): number {
  const baseRadius = Math.pow((3 * volume) / (4 * Math.PI), 1 / 3);
  return baseRadius * FIREBALL_PHYSICS.COLLISION_VISUAL_SCALE;
}

/**
 * Calculate mass of a fireball with improved consistency
 */
export function calculateFireballMass(radius: number): number {
  // Use the actual collision radius for mass calculation
  const collisionRadius = radius / FIREBALL_PHYSICS.COLLISION_VISUAL_SCALE;
  return calculateFireballVolume(collisionRadius);
}

/**
 * Update fireball radius and mass with consistent collision boundaries
 */
export function updateFireballRadius(fireball: Fireball, currentTime: number): void {
  fireball.radius = calculateCurrentRadius(fireball, currentTime);
  // Update mass based on collision radius
  fireball.mass = calculateFireballMass(fireball.radius);
}

/**
 * Check if two fireballs are colliding with improved collision detection
 */
export function areFireballsColliding(f1: Fireball, f2: Fireball, currentTime: number): boolean {
  // Early exit if either fireball is too new
  const growth1 = (currentTime - f1.createdAt) / FIREBALL_PHYSICS.GROWTH_DURATION;
  const growth2 = (currentTime - f2.createdAt) / FIREBALL_PHYSICS.GROWTH_DURATION;

  if (growth1 < FIREBALL_PHYSICS.COLLISION_GROWTH_THRESHOLD || growth2 < FIREBALL_PHYSICS.COLLISION_GROWTH_THRESHOLD) {
    return false;
  }

  // Calculate squared distance for early exit
  const dx = f2.x - f1.x;
  const dy = f2.y - f1.y;
  const distanceSquared = dx * dx + dy * dy;

  // Get current radii for both fireballs
  const radius1 = calculateCurrentRadius(f1, currentTime);
  const radius2 = calculateCurrentRadius(f2, currentTime);
  const radiusSum = (radius1 + radius2) * FIREBALL_PHYSICS.COLLISION_THRESHOLD;
  const radiusSumSquared = radiusSum * radiusSum;

  // Early exit if definitely not colliding
  if (distanceSquared > radiusSumSquared) {
    return false;
  }

  // Calculate relative velocity for collision check
  const relativeVx = f2.vx - f1.vx;
  const relativeVy = f2.vy - f1.vy;
  const relativeSpeed = Math.sqrt(relativeVx * relativeVx + relativeVy * relativeVy);

  // Check if moving fast enough for collision
  return relativeSpeed > FIREBALL_PHYSICS.MIN_COLLISION_VELOCITY;
}

/**
 * Merge two fireballs with improved physics consistency
 */
export function mergeFireballs(f1: Fireball, f2: Fireball, currentTime: number): Fireball {
  // Calculate current volumes based on collision radii
  const volume1 = calculateFireballVolume(calculateCurrentRadius(f1, currentTime));
  const volume2 = calculateFireballVolume(calculateCurrentRadius(f2, currentTime));
  const totalVolume = (volume1 + volume2) * FIREBALL_PHYSICS.MERGE_SIZE_FACTOR;

  // Calculate new target radius with collision scaling
  const newTargetRadius = calculateRadiusFromVolume(totalVolume);

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

  return {
    id: `merged_${f1.id}_${f2.id}`,
    x: newX,
    y: newY,
    radius: newTargetRadius,
    targetRadius: newTargetRadius,
    growthEndTime: currentTime,
    vx: newVx,
    vy: newVy,
    createdAt: currentTime,
    mass: totalMass,
    mergeCount: (f1.mergeCount ?? 1) + (f2.mergeCount ?? 1),
  };
}

/**
 * Process all fireball collisions with improved detection and merging
 */
export function processFireballCollisions(fireballs: Fireball[], currentTime: number): Fireball[] {
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
