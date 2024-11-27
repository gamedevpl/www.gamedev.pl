import { GameWorldState, Santa } from '../game-world/game-world-types';
import { AI_BEHAVIOR_STATE, AI_CONFIG, AISanta, AIDecision } from './ai-santa-types';

/**
 * Calculate distance between two points
 */
function calculateDistance(x1: number, y1: number, x2: number, y2: number): number {
  return Math.sqrt(Math.pow(x2 - x1, 2) + Math.pow(y2 - y1, 2));
}

/**
 * Determine if AI Santa should change its behavior state
 */
function determineNewState(aiSanta: AISanta, playerSanta: Santa): AI_BEHAVIOR_STATE {
  const distanceToPlayer = calculateDistance(aiSanta.x, aiSanta.y, playerSanta.x, playerSanta.y);

  // State transition logic
  if (distanceToPlayer <= AI_CONFIG.ATTACK_DISTANCE) {
    return AI_BEHAVIOR_STATE.ATTACK;
  } else if (distanceToPlayer <= AI_CONFIG.CHASE_DISTANCE) {
    return AI_BEHAVIOR_STATE.CHASE;
  }

  return AI_BEHAVIOR_STATE.WANDER;
}

/**
 * Generate movement decision for wandering state
 */
function makeWanderDecision(aiSanta: AISanta, currentTime: number): AIDecision {
  // Change direction periodically
  if (currentTime - aiSanta.ai.lastDirectionChange > AI_CONFIG.WANDER_CHANGE_DIRECTION_TIME) {
    aiSanta.ai.lastDirectionChange = currentTime;
    aiSanta.ai.targetX = Math.random() * 800; // Random X position
    aiSanta.ai.targetY = Math.random() * (800 - 200) + 200; // Random Y position within valid range
  }

  // Move towards target position if set
  const input = {
    left: false,
    right: false,
    up: false,
    down: false,
    charging: false,
    chargeStartTime: null,
  };

  if (aiSanta.ai.targetX !== null && aiSanta.ai.targetY !== null) {
    input.left = aiSanta.x > aiSanta.ai.targetX;
    input.right = aiSanta.x < aiSanta.ai.targetX;
    input.up = aiSanta.y > aiSanta.ai.targetY;
    input.down = aiSanta.y < aiSanta.ai.targetY;
  }

  return {
    input,
    direction: input.left ? 'left' : 'right',
  };
}

/**
 * Generate movement decision for chase state
 */
function makeChaseDecision(aiSanta: AISanta, playerSanta: Santa): AIDecision {
  const input = {
    left: aiSanta.x > playerSanta.x,
    right: aiSanta.x < playerSanta.x,
    up: aiSanta.y > playerSanta.y,
    down: aiSanta.y < playerSanta.y,
    charging: false,
    chargeStartTime: null,
  };

  return {
    input,
    direction: input.left ? 'left' : 'right',
  };
}

/**
 * Generate movement decision for attack state
 */
function makeAttackDecision(aiSanta: AISanta, playerSanta: Santa, currentTime: number): AIDecision {
  // Basic movement similar to chase
  const movement = makeChaseDecision(aiSanta, playerSanta);

  // Determine if we should start charging
  const timeSinceLastAttack = currentTime - aiSanta.ai.lastAttackTime;
  const hasEnoughEnergy = aiSanta.energy >= AI_CONFIG.ATTACK_ENERGY_THRESHOLD;
  const canStartNewCharge = timeSinceLastAttack > AI_CONFIG.ATTACK_COOLDOWN;
  const isCurrentlyCharging = aiSanta.ai.currentChargeStartTime !== null;

  if (!isCurrentlyCharging && hasEnoughEnergy && canStartNewCharge) {
    // Start charging
    movement.input.charging = true;
    movement.input.chargeStartTime = currentTime;
    aiSanta.ai.currentChargeStartTime = currentTime;
  } else if (isCurrentlyCharging) {
    // Continue charging
    const chargeTime = currentTime - aiSanta.ai.currentChargeStartTime!;

    // Check if we should release the fireball
    if (chargeTime >= AI_CONFIG.MAX_CHARGE_TIME) {
      // Stop charging and prepare to launch
      movement.input.charging = false;
      movement.input.chargeStartTime = null;
      aiSanta.ai.currentChargeStartTime = null;
      aiSanta.ai.lastAttackTime = currentTime;
    } else {
      // Continue charging
      movement.input.charging = true;
      movement.input.chargeStartTime = aiSanta.ai.currentChargeStartTime;
    }
  }

  // Update direction to face the player
  movement.direction = movement.input.left ? 'left' : 'right';

  return movement;
}

/**
 * Main AI decision-making function
 */
export function makeAIDecision(aiSanta: AISanta, gameState: GameWorldState, currentTime: number): AIDecision {
  // Determine new state
  const newState = determineNewState(aiSanta, gameState.playerSanta);

  // If we were charging but state changed from ATTACK, stop charging
  if (
    aiSanta.ai.behaviorState === AI_BEHAVIOR_STATE.ATTACK &&
    newState !== AI_BEHAVIOR_STATE.ATTACK &&
    aiSanta.ai.currentChargeStartTime !== null
  ) {
    aiSanta.ai.currentChargeStartTime = null;
  }

  aiSanta.ai.behaviorState = newState;

  // Make decision based on current state
  switch (aiSanta.ai.behaviorState) {
    case AI_BEHAVIOR_STATE.ATTACK:
      return makeAttackDecision(aiSanta, gameState.playerSanta, currentTime);
    case AI_BEHAVIOR_STATE.CHASE:
      return makeChaseDecision(aiSanta, gameState.playerSanta);
    case AI_BEHAVIOR_STATE.WANDER:
    default:
      return makeWanderDecision(aiSanta, currentTime);
  }
}

/**
 * Initialize AI state for a Santa
 */
export function initializeAIState(aiSanta: AISanta): void {
  aiSanta.ai = {
    behaviorState: AI_BEHAVIOR_STATE.WANDER,
    lastDirectionChange: 0,
    lastAttackTime: 0,
    targetX: null,
    targetY: null,
    currentChargeStartTime: null,
  };
}
