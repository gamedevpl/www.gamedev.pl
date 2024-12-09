import { GAME_WORLD_HEIGHT, GAME_WORLD_WIDTH } from './game-world-consts';
import { Fireball, GameWorldState, Santa, SANTA_PHYSICS, FIREBALL_PHYSICS, SantaInputState } from './game-world-types';

export function createSanta(id: string, x = GAME_WORLD_WIDTH / 2, y = GAME_WORLD_HEIGHT / 2, isPlayer = false): Santa {
  return {
    id,
    x,
    y,
    vx: 0,
    vy: 0,
    ax: 0,
    ay: 0,
    angle: 0,
    angularVelocity: 0,
    direction: 'right',
    energy: SANTA_PHYSICS.MAX_ENERGY,
    energyRegenPaused: false,
    input: {
      left: false,
      right: false,
      up: false,
      down: false,
      charging: false,
      chargeStartTime: null,
    },
    isPlayer,
  };
}

export function moveSanta(santa: Santa, input: Partial<SantaInputState>): void {
  santa.input = {
    ...santa.input,
    ...input,
  };
}

export function setSantaDirection(santa: Santa, direction: 'left' | 'right'): void {
  if (santa.direction !== direction) {
    santa.direction = direction;
    santa.angle = direction === 'left' ? Math.PI - santa.angle : -Math.PI - santa.angle;
  }
}

/**
 * Check if a fireball hits a Santa
 */
export function checkFireballSantaCollision(fireball: Fireball, santa: Santa): boolean {
  const dx = santa.x - fireball.x;
  const dy = santa.y - fireball.y;
  const distance = Math.sqrt(dx * dx + dy * dy);
  return distance < fireball.radius;
}

/**
 * Calculate the pushback force based on distance from fireball center
 */
function calculatePushbackForce(fireball: Fireball, distance: number): number {
  // Base force depends on fireball size
  const baseForce =
    FIREBALL_PHYSICS.PUSHBACK_BASE_FORCE + fireball.targetRadius * FIREBALL_PHYSICS.PUSHBACK_RADIUS_MULTIPLIER;

  // Force decreases with distance (inverse relationship)
  const normalizedDistance = Math.max(0.1, distance / fireball.radius); // Prevent division by zero
  const distanceFactor = 1 / Math.pow(normalizedDistance, FIREBALL_PHYSICS.PUSHBACK_DISTANCE_FACTOR);

  return baseForce * distanceFactor;
}

/**
 * Calculate the pushback vector for collision
 */
function calculatePushbackVector(fireball: Fireball, santa: Santa): { vx: number; vy: number } {
  // Calculate vector from fireball center to santa
  const dx = santa.x - fireball.x;
  const dy = santa.y - fireball.y;
  const distance = Math.sqrt(dx * dx + dy * dy);

  // Normalize the vector
  const nx = dx / distance;
  const ny = dy / distance;

  // Calculate force magnitude
  const force = calculatePushbackForce(fireball, distance);

  // Calculate velocity components
  const vx = nx * force;
  const vy = ny * force;

  return { vx, vy };
}

/**
 * Clamp velocity components to prevent extreme knockbacks
 */
function clampVelocity(vx: number, vy: number): { vx: number; vy: number } {
  const speed = Math.sqrt(vx * vx + vy * vy);
  if (speed > FIREBALL_PHYSICS.MAX_PUSHBACK_VELOCITY) {
    const scale = FIREBALL_PHYSICS.MAX_PUSHBACK_VELOCITY / speed;
    return {
      vx: vx * scale,
      vy: vy * scale,
    };
  }
  return { vx, vy };
}

/**
 * Handle collision between a fireball and Santa
 */
export function handleFireballSantaCollision(fireball: Fireball, santa: Santa): void {
  // Calculate pushback vector
  const pushback = calculatePushbackVector(fireball, santa);

  // Clamp velocity to prevent extreme knockbacks
  const clampedVelocity = clampVelocity(pushback.vx, pushback.vy);

  // Apply pushback velocity to Santa
  santa.vx += clampedVelocity.vx;
  santa.vy += clampedVelocity.vy;

  // Clamp final velocity to prevent exceeding maximum allowed velocity
  const finalVelocity = clampVelocity(santa.vx, santa.vy);
  santa.vx = finalVelocity.vx;
  santa.vy = finalVelocity.vy;

  // Reduce Santa's energy based on fireball properties (existing mechanic)
  const energyReduction = fireball.targetRadius * 0.5;
  santa.energy = Math.max(0, santa.energy - energyReduction);
  santa.energyRegenPaused = true;
}

// Calculate fireball properties based on charging time and available energy
function calculateFireballProperties(chargeTime: number, availableEnergy: number) {
  const chargeTimeSeconds = chargeTime / 1000;
  const baseRadius = FIREBALL_PHYSICS.MIN_RADIUS + chargeTimeSeconds * FIREBALL_PHYSICS.GROWTH_RATE;
  const energyCost = Math.min(
    availableEnergy,
    (baseRadius - FIREBALL_PHYSICS.MIN_RADIUS) * FIREBALL_PHYSICS.ENERGY_TO_SIZE_RATIO,
  );
  const radius = FIREBALL_PHYSICS.MIN_RADIUS + energyCost / FIREBALL_PHYSICS.ENERGY_TO_SIZE_RATIO;
  const velocity = FIREBALL_PHYSICS.BASE_VELOCITY + energyCost * FIREBALL_PHYSICS.ENERGY_TO_VELOCITY_RATIO;

  return { radius, velocity, energyCost };
}

function createFireball(
  id: string,
  x: number,
  y: number,
  targetRadius: number,
  velocity: number,
  angle: number,
  santa: Santa,
): Fireball {
  const now = Date.now();

  // Calculate base velocity components from angle and velocity
  const baseVx = velocity * Math.cos(angle);
  const baseVy = velocity * Math.sin(angle);

  // Add santa's velocity components to create a combined velocity
  const combinedVx = baseVx * 0.1 + santa.vx * 1.9;
  const combinedVy = baseVy * 0.1 + santa.vy * 1.9;

  // Calculate the combined velocity magnitude
  const combinedVelocity = Math.sqrt(combinedVx * combinedVx + combinedVy * combinedVy);

  // If the combined velocity exceeds the maximum allowed velocity, scale it down
  const maxVelocity = velocity * 2; // Allow up to 100% increase from santa's momentum
  const scale = combinedVelocity > maxVelocity ? maxVelocity / combinedVelocity : 1;

  // Apply the scaling to get final velocity components
  const finalVx = combinedVx * scale;
  const finalVy = combinedVy * scale;

  return {
    id,
    x,
    y,
    radius: 0, // Start with 0 radius
    targetRadius, // Store the target radius
    growthEndTime: now + FIREBALL_PHYSICS.GROWTH_DURATION, // Set when growth should end
    createdAt: now,
    vx: finalVx,
    vy: finalVy,
    mass: calculateFireballMass(targetRadius), // Calculate mass based on target radius
    mergeCount: 1,
  };
}

// Helper function for fireball mass calculation
function calculateFireballMass(radius: number): number {
  return (4 / 3) * Math.PI * Math.pow(radius, 3);
}

function createFireballFromSanta(santa: Santa, chargeTime: number): { fireball: Fireball; energyCost: number } | null {
  if (chargeTime < FIREBALL_PHYSICS.MIN_CHARGE_TIME) {
    return null;
  }

  const props = calculateFireballProperties(chargeTime, santa.energy);
  const fireball = createFireball(
    `fireball_${Date.now()}`,
    santa.x,
    santa.y,
    props.radius, // This becomes the target radius
    props.velocity,
    santa.angle,
    santa,
  );

  return { fireball, energyCost: props.energyCost };
}

export function addFireballFromSanta(world: GameWorldState, santa: Santa, chargeTime: number): boolean {
  const result = createFireballFromSanta(santa, chargeTime);
  if (!result) return false;

  const { fireball, energyCost } = result;
  santa.energy = Math.max(0, santa.energy - energyCost);
  santa.energyRegenPaused = true;
  world.fireballs.push(fireball);

  return true;
}