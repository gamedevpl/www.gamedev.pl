import { GameWorldState, Gift, GIFT_PHYSICS } from './game-world-types';

/**
 * Update floating gift position
 */
function updateFloatingGift(gift: Gift, time: number) {
  if (gift.floatOffset === undefined) {
    gift.floatOffset = Math.random() * Math.PI * 2;
  }

  // Calculate vertical offset using sine wave
  const floatY = Math.sin(time * GIFT_PHYSICS.FLOAT_FREQUENCY + gift.floatOffset) * GIFT_PHYSICS.FLOAT_AMPLITUDE;
  gift.y += floatY;
}

/**
 * Update carried gift position
 */
function updateCarriedGift(gift: Gift, world: GameWorldState) {
  const carriedBy = world.santas.find((santa) => santa.id === gift.carriedBy);
  if (!carriedBy) {
    // If the carrying Santa is not found, transition to falling state
    gift.state = 'falling';
    gift.carriedBy = undefined;
    return;
  }

  // Update gift position to match Santa's position
  gift.x = carriedBy.x;
  gift.y = carriedBy.y;
}

/**
 * Update falling gift physics
 */
function updateFallingGift(gift: Gift) {
  // Apply gravity (negative vy means falling)
  gift.vy += GIFT_PHYSICS.GRAVITY;

  // Limit fall velocity (negative velocity for falling)
  if (gift.vy > GIFT_PHYSICS.MAX_FALL_VELOCITY) {
    gift.vy = GIFT_PHYSICS.MAX_FALL_VELOCITY;
  }

  // Update position
  gift.x += gift.vx;
  gift.y += gift.vy;

  // Check if gift has reached the ground
  if (gift.y >= GIFT_PHYSICS.GROUND_LEVEL) {
    gift.y = GIFT_PHYSICS.GROUND_LEVEL;
    gift.state = 'grounded';
    gift.vy = 0;
    gift.vx = 0;
  }
}

/**
 * Update grounded gift state
 */
function updateGroundedGift(gift: Gift) {
  // Ensure gift stays at ground level
  gift.y = GIFT_PHYSICS.GROUND_LEVEL;
  gift.vy = 0;
  gift.vx = 0;
}

/**
 * Update gift based on its current state
 */
function updateGiftByState(gift: Gift, world: GameWorldState, time: number) {
  switch (gift.state) {
    case 'floating':
      updateFloatingGift(gift, time);
      break;
    case 'carried':
      updateCarriedGift(gift, world);
      break;
    case 'falling':
      updateFallingGift(gift);
      break;
    case 'grounded':
      updateGroundedGift(gift);
      break;
  }
}

/**
 * Main gift update function
 */
export function updateGifts(world: GameWorldState) {
  for (const gift of world.gifts) {
    updateGiftByState(gift, world, world.time);
  }
}
