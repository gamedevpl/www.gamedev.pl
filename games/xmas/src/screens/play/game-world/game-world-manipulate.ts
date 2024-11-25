import { GAME_WORLD_HEIGHT, GAME_WORLD_WIDTH } from './game-world-consts';
import { Fireball, GameWorldState, Santa, SANTA_PHYSICS, FIREBALL_PHYSICS, SantaInputState } from './game-world-types';

export function createSanta(
  id: string,
  x = GAME_WORLD_WIDTH / 2,
  y = GAME_WORLD_HEIGHT / 2,
  isPlayer = false,
): Santa {
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

function createFireball(id: string, x: number, y: number, radius: number, velocity: number, angle: number): Fireball {
  return {
    id,
    x,
    y,
    radius,
    createdAt: Date.now(),
    vx: velocity * Math.cos(angle),
    vy: velocity * Math.sin(angle),
  };
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