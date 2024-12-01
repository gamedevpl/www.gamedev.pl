import { GAME_WORLD_WIDTH } from './game-world-consts';
import { GameWorldState, Gift, GIFT_PHYSICS, Santa, GiftState, GIFT_SPAWN } from './game-world-types';

/**
 * Try to collect any gifts that are within collection range of the Santa
 * Returns true if a gift was collected
 */
export function tryCollectNearbyGifts(world: GameWorldState, santa: Santa): boolean {
  // If Santa is already carrying a gift, skip collection
  if (santa.carriedGift) {
    return false;
  }

  // Find the first collectable gift
  for (const gift of world.gifts) {
    if (canCollectGift(gift, santa)) {
      return collectGift(world, gift.id, santa.id);
    }
  }

  return false;
}

/**
 * Get the count of active gifts in the world
 */
export function getActiveGiftCount(world: GameWorldState): number {
  return world.gifts.length;
}

/**
 * Check if a new gift should be spawned
 */
export function shouldSpawnGift(world: GameWorldState): boolean {
  const activeGifts = getActiveGiftCount(world);
  const timeToSpawn = world.time >= world.nextGiftSpawnTime;

  return activeGifts < GIFT_SPAWN.MAX_CONCURRENT_GIFTS && timeToSpawn;
}

/**
 * Update gift spawn timing
 */
export function updateGiftSpawnTiming(world: GameWorldState): void {
  if (world.time >= world.nextGiftSpawnTime) {
    world.lastGiftSpawnTime = world.time;
    // Calculate random interval between MIN and MAX spawn intervals
    const spawnInterval =
      GIFT_SPAWN.MIN_SPAWN_INTERVAL + Math.random() * (GIFT_SPAWN.MAX_SPAWN_INTERVAL - GIFT_SPAWN.MIN_SPAWN_INTERVAL);
    world.nextGiftSpawnTime = world.time + spawnInterval;
  }
}

/**
 * Create a new gift at specified position
 */
export function createGift(id: string, x: number, y: number): Gift {
  return {
    id,
    x,
    y,
    vx: 0,
    vy: 0,
    angle: 0,
    state: 'floating',
    createdAt: Date.now(),
  };
}

/**
 * Spawn a new gift at a random position
 */
export function spawnGift(world: GameWorldState): void {
  // Check if we can spawn more gifts
  if (getActiveGiftCount(world) >= GIFT_SPAWN.MAX_CONCURRENT_GIFTS) {
    return;
  }

  const x = Math.random() * GAME_WORLD_WIDTH;
  const y =
    GIFT_PHYSICS.SPAWN_HEIGHT_MIN + Math.random() * (GIFT_PHYSICS.SPAWN_HEIGHT_MAX - GIFT_PHYSICS.SPAWN_HEIGHT_MIN);

  const gift = createGift(`gift_${Date.now()}`, x, y);
  world.gifts.push(gift);
}

/**
 * Check if a gift can be collected by Santa
 */
export function canCollectGift(gift: Gift, santa: Santa): boolean {
  if (gift.state !== 'floating' && gift.state !== 'grounded' && gift.state !== 'falling') return false;
  if (santa.carriedGift) return false;
  if (gift.throwTime && Date.now() - gift.throwTime < GIFT_PHYSICS.THROW_COOLDOWN) return false;

  const dx = santa.x - gift.x;
  const dy = santa.y - gift.y;
  const distance = Math.sqrt(dx * dx + dy * dy);

  return distance <= GIFT_PHYSICS.COLLECTION_RADIUS;
}

/**
 * Collect a gift
 */
export function collectGift(world: GameWorldState, giftId: string, santaId: string): boolean {
  const gift = world.gifts.find((g) => g.id === giftId);
  const santa = world.santas.find((s) => s.id === santaId);

  if (!gift || !santa) return false;
  if (!canCollectGift(gift, santa)) return false;

  gift.state = 'carried';
  gift.carriedBy = santa.id;
  santa.carriedGift = gift.id;

  return true;
}

/**
 * Check if a gift can be delivered to a chimney
 */
export function canDeliverGift(gift: Gift, x: number, y: number): boolean {
  if (gift.state !== 'carried' && gift.state !== 'grounded') return false;

  const dx = x - gift.x;
  const dy = y - gift.y;
  const distance = Math.sqrt(dx * dx + dy * dy);

  return distance <= GIFT_PHYSICS.DELIVERY_RADIUS;
}

/**
 * Deliver a gift to a chimney
 */
export function deliverGift(world: GameWorldState, giftId: string, chimneyId: string): boolean {
  const gift = world.gifts.find((g) => g.id === giftId);
  const chimney = world.chimneys.find((c) => c.id === chimneyId);

  if (!gift || !chimney) return false;
  if (!canDeliverGift(gift, chimney.x, chimney.y)) return false;

  // Find Santa carrying the gift
  if (gift.carriedBy) {
    const santa = world.santas.find((s) => s.id === gift.carriedBy);
    if (santa) {
      santa.carriedGift = undefined;
    }
  }

  // Remove the delivered gift
  world.gifts = world.gifts.filter((g) => g.id !== giftId);

  return true;
}

/**
 * Drop a carried gift
 */
export function dropGift(world: GameWorldState, santaId: string): boolean {
  const santa = world.santas.find((s) => s.id === santaId);
  if (!santa || !santa.carriedGift) return false;

  const gift = world.gifts.find((g) => g.id === santa.carriedGift);
  if (!gift || gift.state !== 'carried') return false;

  // Transition gift to falling state
  gift.state = 'falling';
  gift.carriedBy = undefined;
  santa.carriedGift = undefined;

  // Initialize falling physics with Santa's momentum
  gift.vx = santa.vx * 0.5;
  gift.vy = santa.vy * 0.5;

  return true;
}

/**
 * Check if a Santa can throw a gift
 */
export function canThrowGift(santa: Santa, gift: Gift): boolean {
  if (!santa || !gift) return false;
  if (gift.state !== 'carried') return false;
  if (gift.carriedBy !== santa.id) return false;
  if (santa.carriedGift !== gift.id) return false;

  return true;
}

/**
 * Validate gift throw parameters
 */
export function validateThrowParameters(velocity: number, angle: number): boolean {
  if (velocity < GIFT_PHYSICS.MIN_THROW_VELOCITY || velocity > GIFT_PHYSICS.MAX_THROW_VELOCITY) return false;
  if (angle < GIFT_PHYSICS.THROW_ANGLE_MIN || angle > GIFT_PHYSICS.THROW_ANGLE_MAX) return false;

  return true;
}

/**
 * Calculate initial throw velocity components
 */
export function calculateThrowVelocityComponents(
  velocity: number,
  angle: number,
  santaVx: number,
  santaVy: number,
): { vx: number; vy: number } {
  const baseVx = velocity * Math.cos(angle);
  const baseVy = velocity * Math.sin(angle);

  // Add Santa's momentum
  const vx = baseVx + santaVx * GIFT_PHYSICS.THROW_MOMENTUM_TRANSFER;
  const vy = baseVy + santaVy * GIFT_PHYSICS.THROW_MOMENTUM_TRANSFER;

  return { vx, vy };
}

/**
 * Initialize gift for thrown state
 */
export function initializeGiftThrow(gift: Gift, velocity: number, angle: number, vx: number, vy: number): void {
  gift.state = 'falling';
  gift.throwVelocity = velocity;
  gift.throwAngle = angle;
  gift.vx = vx;
  gift.vy = vy;
  gift.angularVelocity = GIFT_PHYSICS.THROW_ANGULAR_VELOCITY * (Math.random() > 0.5 ? 1 : -1);
}

/**
 * Clear gift-santa relationship
 */
export function clearGiftSantaRelationship(gift: Gift, santa: Santa): void {
  gift.carriedBy = undefined;
  santa.carriedGift = undefined;
}

/**
 * Transition gift state
 */
export function transitionGiftState(gift: Gift, newState: GiftState): void {
  gift.state = newState;

  // Reset specific properties based on new state
  if (newState === 'grounded') {
    gift.vx = 0;
    gift.vy = 0;
    gift.angularVelocity = 0;
    gift.y = GIFT_PHYSICS.GROUND_LEVEL;
  } else if (newState === 'falling') {
    gift.angularVelocity = 0;
  }
}
