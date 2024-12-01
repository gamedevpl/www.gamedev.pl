import { GAME_WORLD_HEIGHT, GAME_WORLD_WIDTH } from './game-world-consts';
import {
  Fireball,
  GameWorldState,
  Santa,
  SANTA_PHYSICS,
  FIREBALL_PHYSICS,
  SantaInputState,
  GIFT_PHYSICS,
  Gift,
} from './game-world-types';

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
 * Handle collision between a fireball and Santa
 */
export function handleFireballSantaCollision(_state: GameWorldState, fireball: Fireball, santa: Santa): void {
  // Reduce Santa's energy based on fireball properties
  const energyReduction = fireball.radius * 0.5;
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

/**
 * Calculate throw velocity and direction for a gift based on charge time
 */
function calculateGiftThrowProperties(santa: Santa, chargeTime: number) {
  const chargeTimeSeconds = Math.min(chargeTime / 1000, 3); // Cap charge time at 3 seconds
  const chargeRatio = Math.min(chargeTimeSeconds / 3, 1); // Normalize to 0-1 range

  // Calculate velocity based on charge time
  const velocityRange = GIFT_PHYSICS.MAX_THROW_VELOCITY - GIFT_PHYSICS.MIN_THROW_VELOCITY;
  const throwVelocity = GIFT_PHYSICS.MIN_THROW_VELOCITY + velocityRange * chargeRatio;

  // Calculate throw angle based on Santa's direction and current angle
  const baseAngle = santa.direction === 'right' ? santa.angle : Math.PI - santa.angle;

  // Adjust angle based on charge time (higher charge = higher angle)
  const angleRange = GIFT_PHYSICS.THROW_ANGLE_MAX - GIFT_PHYSICS.THROW_ANGLE_MIN;
  const angleOffset = angleRange * chargeRatio;
  const throwAngle = Math.max(
    GIFT_PHYSICS.THROW_ANGLE_MIN,
    Math.min(GIFT_PHYSICS.THROW_ANGLE_MAX, baseAngle + angleOffset),
  );

  return {
    throwVelocity,
    throwAngle,
    angularVelocity: GIFT_PHYSICS.THROW_ANGULAR_VELOCITY * (Math.random() > 0.5 ? 1 : -1),
  };
}

/**
 * Find a gift carried by a Santa
 */
function findCarriedGift(world: GameWorldState, santa: Santa): Gift | undefined {
  return world.gifts.find((gift) => gift.carriedBy === santa.id);
}

/**
 * Validate if the gift can be thrown based on charge time
 */
function validateGiftThrow(chargeTime: number): boolean {
  const MIN_CHARGE_TIME = 200; // Minimum 0.2 seconds charge time
  return chargeTime >= MIN_CHARGE_TIME;
}

/**
 * Throw a gift that Santa is currently carrying
 */
export function throwGift(world: GameWorldState, santa: Santa, chargeTime: number): boolean {
  // Validate throw conditions
  if (!validateGiftThrow(chargeTime)) return false;

  // Find the gift being carried by this Santa
  const gift = findCarriedGift(world, santa);
  if (!gift) return false;

  // Calculate throw properties based on charge time
  const { throwVelocity, throwAngle, angularVelocity } = calculateGiftThrowProperties(santa, chargeTime);

  // Calculate initial velocity components
  const baseVx = throwVelocity * Math.cos(throwAngle);
  const baseVy = throwVelocity * Math.sin(throwAngle);

  // Add Santa's momentum to the throw
  const vx = baseVx + santa.vx * GIFT_PHYSICS.THROW_MOMENTUM_TRANSFER;
  const vy = baseVy + santa.vy * GIFT_PHYSICS.THROW_MOMENTUM_TRANSFER;

  // Update gift properties for thrown state
  gift.state = 'falling';
  gift.throwTime = world.time;
  gift.carriedBy = undefined;
  gift.vx = vx;
  gift.vy = vy;
  gift.throwVelocity = throwVelocity;
  gift.throwAngle = throwAngle;
  gift.angularVelocity = angularVelocity;

  // Clear Santa's carried gift reference
  santa.carriedGift = undefined;

  return true;
}
