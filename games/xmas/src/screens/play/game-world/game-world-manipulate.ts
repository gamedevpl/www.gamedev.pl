import { GAME_WORLD_HEIGHT, GAME_WORLD_WIDTH } from './game-world-consts';
import { Fireball, GameWorldState, Santa, SANTA_PHYSICS, FIREBALL_PHYSICS, SantaInputState } from './game-world-types';

/**
 * Creates a new Santa instance with initial state
 */
export function createSanta(
  id: string,
  x: number = GAME_WORLD_WIDTH / 2,
  y: number = GAME_WORLD_HEIGHT / 2,
  isPlayer: boolean = false,
): Santa {
  const initialInput: SantaInputState = {
    left: false,
    right: false,
    up: false,
    down: false,
    charging: false,
    chargeStartTime: null,
  };

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
    input: initialInput,
    isPlayer,
  };
}

/**
 * Updates Santa's input state based on provided input
 * Preserves existing input state for properties not included in the update
 */
export function moveSanta(santa: Santa, input: Partial<SantaInputState>): void {
  // Validate and merge input with existing state
  santa.input = {
    ...santa.input,
    // Update only provided input properties, maintaining existing values for others
    left: input.left !== undefined ? input.left : santa.input.left,
    right: input.right !== undefined ? input.right : santa.input.right,
    up: input.up !== undefined ? input.up : santa.input.up,
    down: input.down !== undefined ? input.down : santa.input.down,
    charging: input.charging !== undefined ? input.charging : santa.input.charging,
    chargeStartTime: input.chargeStartTime !== undefined ? input.chargeStartTime : santa.input.chargeStartTime,
  };
}

/**
 * Sets Santa's direction and updates related properties
 */
export function setSantaDirection(santa: Santa, direction: 'left' | 'right'): void {
  if (santa.direction !== direction) {
    santa.direction = direction;
    // Adjust angle when changing direction
    if (direction === 'left') {
      santa.angle = Math.PI - santa.angle;
    } else {
      santa.angle = -Math.PI - santa.angle;
    }
  }
}

/**
 * Calculate fireball properties based on charging time and current energy
 */
function calculateFireballProperties(chargeTime: number, availableEnergy: number) {
  // Calculate base radius based on charge time
  const chargeTimeSeconds = chargeTime / 1000;
  const baseRadius = FIREBALL_PHYSICS.MIN_RADIUS + chargeTimeSeconds * FIREBALL_PHYSICS.GROWTH_RATE;

  // Calculate energy cost based on radius
  const energyCost = Math.min(
    availableEnergy,
    (baseRadius - FIREBALL_PHYSICS.MIN_RADIUS) * FIREBALL_PHYSICS.ENERGY_TO_SIZE_RATIO,
  );

  // Final radius considering available energy
  const radius = FIREBALL_PHYSICS.MIN_RADIUS + energyCost / FIREBALL_PHYSICS.ENERGY_TO_SIZE_RATIO;

  // Calculate velocity based on energy cost
  const velocity = FIREBALL_PHYSICS.BASE_VELOCITY + energyCost * FIREBALL_PHYSICS.ENERGY_TO_VELOCITY_RATIO;

  return {
    radius,
    velocity,
    energyCost,
  };
}

/**
 * Creates a new fireball with specified properties
 */
function createFireball(id: string, x: number, y: number, radius: number, velocity: number, angle: number): Fireball {
  // Calculate velocity components based on angle
  const vx = velocity * Math.cos(angle);
  const vy = velocity * Math.sin(angle);

  return {
    id,
    x,
    y,
    radius,
    createdAt: Date.now(),
    vx,
    vy,
  };
}

/**
 * Creates a new fireball from Santa's current state and charging time
 * Returns null if fireball cannot be created (insufficient energy)
 */
export function createFireballFromSanta(
  santa: Santa,
  chargeTime: number,
): { fireball: Fireball; energyCost: number } | null {
  if (chargeTime < FIREBALL_PHYSICS.MIN_CHARGE_TIME) {
    return null;
  }

  // Calculate fireball properties based on charge time and available energy
  const props = calculateFireballProperties(chargeTime, santa.energy);

  // Create fireball at Santa's position with calculated properties
  const fireball = createFireball(
    `fireball_${Date.now()}`,
    santa.x,
    santa.y,
    props.radius,
    props.velocity,
    santa.angle,
  );

  return {
    fireball,
    energyCost: props.energyCost,
  };
}

/**
 * Adds a fireball to the game world and updates Santa's energy
 */
export function addFireballFromSanta(world: GameWorldState, santa: Santa, chargeTime: number): boolean {
  const result = createFireballFromSanta(santa, chargeTime);

  if (!result) {
    return false;
  }

  const { fireball, energyCost } = result;

  // Update Santa's energy
  santa.energy = Math.max(0, santa.energy - energyCost);
  santa.energyRegenPaused = true;

  // Add fireball to world
  world.fireballs.push(fireball);
  return true;
}
