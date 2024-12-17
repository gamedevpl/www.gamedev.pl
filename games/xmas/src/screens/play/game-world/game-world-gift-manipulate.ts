import { GAME_WORLD_WIDTH } from './game-world-consts';
import { GameWorldState, Gift, GIFT_CONSTANTS, Santa, SANTA_PHYSICS } from './game-world-types';

/**
 * Try to collect any gifts that are within collection range of the Santa
 * Returns true if a gift was collected
 */
export function tryCollectNearbyGifts(world: GameWorldState, santa: Santa): boolean {
  // Find the first collectable gift
  const giftIndex = world.gifts.findIndex(gift => canCollectGift(gift, santa));
  
  if (giftIndex !== -1) {
    // Collect the gift and give energy to Santa
    collectGift(world, giftIndex, santa);
    return true;
  }

  return false;
}

/**
 * Get the count of active gifts in the world
 */
function getActiveGiftCount(world: GameWorldState): number {
  return world.gifts.length;
}

/**
 * Check if a new gift should be spawned
 */
export function shouldSpawnGift(world: GameWorldState): boolean {
  const activeGifts = getActiveGiftCount(world);
  const timeToSpawn = world.time >= world.nextGiftSpawnTime;

  return activeGifts < GIFT_CONSTANTS.MAX_CONCURRENT_GIFTS && timeToSpawn;
}

/**
 * Update gift spawn timing
 */
export function updateGiftSpawnTiming(world: GameWorldState): void {
  if (world.time >= world.nextGiftSpawnTime) {
    world.lastGiftSpawnTime = world.time;
    // Calculate random interval between MIN and MAX spawn intervals
    const spawnInterval =
      GIFT_CONSTANTS.MIN_SPAWN_INTERVAL + 
      Math.random() * (GIFT_CONSTANTS.MAX_SPAWN_INTERVAL - GIFT_CONSTANTS.MIN_SPAWN_INTERVAL);
    world.nextGiftSpawnTime = world.time + spawnInterval;
  }
}

/**
 * Create a new gift at specified position
 */
function createGift(id: string, x: number, y: number, currentTime: number): Gift {
  return {
    id,
    x,
    y,
    createdAt: currentTime,
  };
}

/**
 * Spawn a new gift at a random position
 */
export function spawnGift(world: GameWorldState): void {
  // Check if we can spawn more gifts
  if (getActiveGiftCount(world) >= GIFT_CONSTANTS.MAX_CONCURRENT_GIFTS) {
    return;
  }

  const x = Math.random() * GAME_WORLD_WIDTH;
  const y =
    GIFT_CONSTANTS.SPAWN_HEIGHT_MIN + 
    Math.random() * (GIFT_CONSTANTS.SPAWN_HEIGHT_MAX - GIFT_CONSTANTS.SPAWN_HEIGHT_MIN);

  const gift = createGift(
    `gift_${world.time}_${Math.random().toString(36).substr(2, 9)}`,
    x,
    y,
    world.time
  );
  world.gifts.push(gift);
}

/**
 * Check if a gift can be collected by Santa
 */
function canCollectGift(gift: Gift, santa: Santa): boolean {
  const dx = santa.x - gift.x;
  const dy = santa.y - gift.y;
  const distance = Math.sqrt(dx * dx + dy * dy);

  return distance <= GIFT_CONSTANTS.COLLECTION_RADIUS;
}

/**
 * Collect a gift and give energy to Santa
 */
function collectGift(world: GameWorldState, giftIndex: number, santa: Santa): void {
  // Give energy to Santa
  santa.energy = Math.min(SANTA_PHYSICS.MAX_ENERGY, santa.energy + GIFT_CONSTANTS.ENERGY_BOOST);
  
  // Remove the gift from the world
  world.gifts.splice(giftIndex, 1);
}