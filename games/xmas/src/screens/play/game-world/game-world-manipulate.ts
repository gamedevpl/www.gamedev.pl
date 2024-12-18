import { GAME_WORLD_HEIGHT, GAME_WORLD_WIDTH } from './game-world-consts';
import { Fireball, GameWorldState, Santa, SANTA_PHYSICS, FIREBALL_PHYSICS, SantaInputState } from './game-world-types';
import { calculateFireballMass } from './game-world-collisions';

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
    isEliminated: false,
    dialogues: [
      {
        id: 'dialogue_1',
        text: 'Ho ho ho!',
        duration: 2,
        createdAt: 0,
        fadeInDuration: 0.5,
        fadeOutDuration: 0.5,
        opacity: 1,
      },
    ],
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

function createFireball(
  id: string,
  x: number,
  y: number,
  targetRadius: number,
  velocity: number,
  angle: number,
  santa: Santa,
  currentTime: number,
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
    radius: 0,
    targetRadius,
    growthEndTime: currentTime + FIREBALL_PHYSICS.GROWTH_DURATION,
    createdAt: currentTime,
    vx: finalVx,
    vy: finalVy,
    mass: calculateFireballMass(targetRadius),
    mergeCount: 1,
    launcherId: santa.id, // Add the santa's ID as the launcherId
  };
}

function createFireballFromSanta(
  santa: Santa,
  chargeTime: number,
  world: GameWorldState,
): { fireball: Fireball; energyCost: number } | null {
  if (chargeTime < FIREBALL_PHYSICS.MIN_CHARGE_TIME) {
    return null;
  }

  const props = calculateFireballProperties(chargeTime, santa.energy);
  const fireball = createFireball(
    `fireball_${world.time}_${Math.random().toString(36).substr(2, 9)}`,
    santa.x,
    santa.y,
    props.radius,
    props.velocity,
    santa.angle,
    santa,
    world.time,
  );

  return { fireball, energyCost: props.energyCost };
}

export function addFireballFromSanta(world: GameWorldState, santa: Santa, chargeTime: number): boolean {
  const result = createFireballFromSanta(santa, chargeTime, world);
  if (!result) return false;

  const { fireball, energyCost } = result;
  santa.energy = Math.max(0, santa.energy - energyCost);
  santa.energyRegenPaused = true;
  world.fireballs.push(fireball);

  return true;
}
