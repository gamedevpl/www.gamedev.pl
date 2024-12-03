import { GameWorldState, Gift, GIFT_CONSTANTS } from './game-world-types';

/**
 * Update floating gift position with a simple floating animation
 */
function updateGiftPosition(gift: Gift, time: number) {
  // Initialize float offset if not present
  if (gift.floatOffset === undefined) {
    gift.floatOffset = Math.random() * Math.PI * 2;
  }

  // Calculate vertical offset using sine wave
  const floatY = Math.sin(time * GIFT_CONSTANTS.FLOAT_FREQUENCY + gift.floatOffset) * GIFT_CONSTANTS.FLOAT_AMPLITUDE;
  gift.y += floatY;
}

/**
 * Main gift update function - handles all gifts in the world
 */
export function updateGifts(world: GameWorldState) {
  // Update each gift's position with floating animation
  for (const gift of world.gifts) {
    updateGiftPosition(gift, world.time);
  }
}