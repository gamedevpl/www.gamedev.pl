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
    knockbackVx: 0,
    knockbackVy: 0,
    lastKnockbackTime: 0,
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
 * Calculate knockback force based on fireball properties
 */
function calculateKnockbackForce(fireball: Fireball): number {
  const sizeForce = fireball.radius * SANTA_PHYSICS.KNOCKBACK_SIZE_MULTIPLIER;
  const velocityForce =
    Math.sqrt(fireball.vx * fireball.vx + fireball.vy * fireball.vy) * SANTA_PHYSICS.KNOCKBACK_VELOCITY_MULTIPLIER;
  return SANTA_PHYSICS.KNOCKBACK_BASE_FORCE * (sizeForce + velocityForce);
}

/**
 * Apply knockback to Santa's velocity
 */
function applyKnockback(santa: Santa, force: number, direction: { x: number; y: number }, currentTime: number): void {
  // Normalize direction vector
  const magnitude = Math.sqrt(direction.x * direction.x + direction.y * direction.y);
  const normalizedDir = {
    x: direction.x / magnitude,
    y: direction.y / magnitude,
  };

  // Calculate knockback velocity components
  const knockbackVx = normalizedDir.x * force;
  const knockbackVy = normalizedDir.y * force;

  // Add random variation for more dynamic feel
  const randomFactor = 0.8 + Math.random() * 0.4; // 0.8 to 1.2

  // Update Santa's knockback velocities
  santa.knockbackVx = (santa.knockbackVx || 0) + knockbackVx * randomFactor;
  santa.knockbackVy = (santa.knockbackVy || 0) + knockbackVy * randomFactor;

  // Limit maximum knockback velocity
  const currentKnockbackSpeed = Math.sqrt(
    santa.knockbackVx * santa.knockbackVx + santa.knockbackVy * santa.knockbackVy,
  );

  if (currentKnockbackSpeed > SANTA_PHYSICS.MAX_KNOCKBACK_VELOCITY) {
    const scale = SANTA_PHYSICS.MAX_KNOCKBACK_VELOCITY / currentKnockbackSpeed;
    santa.knockbackVx *= scale;
    santa.knockbackVy *= scale;
  }

  santa.lastKnockbackTime = currentTime;
}

/**
 * Check if a fireball hits a Santa
 */
export function checkFireballSantaCollision(fireball: Fireball, santa: Santa): boolean {
  const dx = santa.x - fireball.x;
  const dy = santa.y - fireball.y;
  const distance = Math.sqrt(dx * dx + dy * dy);
  return distance < fireball.radius; // 30 is approximate Santa radius
}

/**
 * Handle collision between a fireball and Santa
 */
export function handleFireballSantaCollision(state: GameWorldState, fireball: Fireball, santa: Santa): void {
  // Calculate knockback force
  const force = calculateKnockbackForce(fireball);

  // Calculate direction from fireball to Santa
  const dx = santa.x - fireball.x;
  const dy = santa.y - fireball.y;

  // Apply knockback
  applyKnockback(santa, force, { x: dx, y: dy }, state.time);

  // Optional: Reduce Santa's energy
  santa.energy = Math.max(0, santa.energy - force * 0.5);
  santa.energyRegenPaused = true;
}

/**
 * Update Santa's knockback state
 */
export function updateSantaKnockback(santa: Santa, currentTime: number): void {
  if (!santa.knockbackVx && !santa.knockbackVy) return;

  // Calculate recovery based on time since last knockback
  const timeSinceKnockback = currentTime - (santa.lastKnockbackTime || 0);
  const recoveryFactor = Math.min(1, timeSinceKnockback * SANTA_PHYSICS.KNOCKBACK_RECOVERY_RATE);

  // Reduce knockback velocities
  santa.knockbackVx = (santa.knockbackVx || 0) * (1 - recoveryFactor);
  santa.knockbackVy = (santa.knockbackVy || 0) * (1 - recoveryFactor);

  // Clear very small knockback values
  if (Math.abs(santa.knockbackVx) < 0.01) santa.knockbackVx = 0;
  if (Math.abs(santa.knockbackVy) < 0.01) santa.knockbackVy = 0;
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
  radius: number,
  velocity: number,
  angle: number,
  santa: Santa,
): Fireball {
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
    radius,
    createdAt: Date.now(),
    vx: finalVx,
    vy: finalVy,
    mass: calculateFireballMass(radius),
    mergeCount: 1,
  };
}

// Helper function for fireball mass calculation
function calculateFireballMass(radius: number): number {
  return (4 / 3) * Math.PI * Math.pow(radius, 3);
}

export function createFireballFromSanta(
  santa: Santa,
  chargeTime: number,
): { fireball: Fireball; energyCost: number } | null {
  if (chargeTime < FIREBALL_PHYSICS.MIN_CHARGE_TIME) {
    return null;
  }

  const props = calculateFireballProperties(chargeTime, santa.energy);
  const fireball = createFireball(
    `fireball_${Date.now()}`,
    santa.x,
    santa.y,
    props.radius,
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
