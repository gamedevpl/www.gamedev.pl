import { HumanEntity } from '../entities/characters/human/human-types';
import { UpdateContext } from '../world-types';
import { BerryBushEntity } from '../entities/plants/berry-bush/berry-bush-types';
import { vectorDistance, vectorNormalize, vectorSubtract } from '../utils/math-utils';
import { findClosestEntity, getRandomNearbyPosition } from '../utils/world-utils';
import {
  HUMAN_AI_HUNGER_THRESHOLD_FOR_EATING,
  HUMAN_AI_HUNGER_THRESHOLD_FOR_GATHERING,
  HUMAN_AI_IDLE_WANDER_CHANCE,
  HUMAN_AI_WANDER_RADIUS,
  HUMAN_INTERACTION_RANGE,
  HUMAN_BERRY_HUNGER_REDUCTION,
} from '../world-consts';
import { EntityType } from '../entities/entities-types';

/**
 * Updates the AI decision-making for a human entity.
 * Uses a strict priority hierarchy: Eat > Gather > Idle/Wander
 * Each decision path uses early returns to prevent lower-priority actions
 * from overriding higher-priority ones.
 */
export function humanAIUpdate(human: HumanEntity, context: UpdateContext): void {
  const { gameState } = context;

  // ============================================================
  // 1. EATING LOGIC (HIGHEST PRIORITY)
  // ============================================================

  // First, check if human should STOP eating (already eating but hunger is low enough or out of berries)
  if (human.activeAction === 'eating') {
    // Stop eating if out of berries
    if (human.berries <= 0) {
      human.activeAction = 'idle';
      human.direction = { x: 0, y: 0 };
      human.targetPosition = undefined;
      return; // Decision made: became idle because no berries
    }

    // Stop eating if hunger is reduced to a safe level (below threshold minus one berry's worth)
    // This prevents eating all berries when only one is needed
    if (human.hunger <= (HUMAN_AI_HUNGER_THRESHOLD_FOR_EATING - HUMAN_BERRY_HUNGER_REDUCTION)) {
      human.activeAction = 'idle';
      human.direction = { x: 0, y: 0 };
      human.targetPosition = undefined;
      return; // Decision made: became idle because no longer hungry enough
    }
    
    // Continue eating if still hungry and has berries
    return; // Continue eating
  }

  // Then check if human should START eating (hungry and has berries)
  if (human.hunger >= HUMAN_AI_HUNGER_THRESHOLD_FOR_EATING && human.berries > 0) {
    human.activeAction = 'eating';
    human.direction = { x: 0, y: 0 };
    human.targetPosition = undefined;
    return; // Decision made for this tick
  }

  // ============================================================
  // 2. GATHERING LOGIC (SECOND PRIORITY)
  // ============================================================

  // Check if human needs to gather (hungry enough and not at berry capacity)
  if (human.hunger >= HUMAN_AI_HUNGER_THRESHOLD_FOR_GATHERING && human.berries < human.maxBerries) {
    // If already moving to a gathering target
    if (human.activeAction === 'moving' && human.targetPosition) {
      const distance = vectorDistance(human.position, human.targetPosition);

      // Close enough to target, switch to gathering
      if (distance < HUMAN_INTERACTION_RANGE) {
        human.activeAction = 'gathering';
        human.direction = { x: 0, y: 0 };
        human.targetPosition = undefined;
      }
      return; // Continue moving toward gathering target or just switched to gathering
    }

    // If already gathering
    if (human.activeAction === 'gathering') {
      // Stop gathering if berry capacity reached
      if (human.berries >= human.maxBerries) {
        human.activeAction = 'idle';
        human.direction = { x: 0, y: 0 };
        human.targetPosition = undefined;
        return; // Decision made: became idle because full
      }

      // NEW: Validate if there's a viable bush at the current location to continue gathering
      const bushAtLocation = findClosestEntity<BerryBushEntity>(
        human,
        gameState.entities.entities,
        'berryBush' as EntityType,
        gameState.mapDimensions.width,
        gameState.mapDimensions.height,
        HUMAN_INTERACTION_RANGE, // Crucial: check only within immediate interaction range
        (bush) => (bush as BerryBushEntity).currentBerries > 0
      );

      if (!bushAtLocation) {
        // No viable bush at current location, or bush is depleted. Switch to idle.
        human.activeAction = 'idle';
        human.direction = { x: 0, y: 0 };
        human.targetPosition = undefined;
        // The AI will then re-evaluate in the next tick, potentially finding a new bush.
      }
      // If bushAtLocation is found, human.activeAction remains 'gathering'.
      // The state machine for 'gathering' should handle actual berry decrement from bush and increment for human.
      return; // Decision made for this tick (continue gathering or switched to idle due to no bush/being full)
    }

    // Not moving to gather and not gathering - find a berry bush
    const closestBush = findClosestEntity<BerryBushEntity>(
      human,
      gameState.entities.entities,
      'berryBush' as EntityType,
      gameState.mapDimensions.width,
      gameState.mapDimensions.height,
      HUMAN_INTERACTION_RANGE * 10, // Search in a wider range
      (bush) => (bush as BerryBushEntity).currentBerries > 0, // Only consider bushes with berries
    );

    // If found a bush with berries, move toward it
    if (closestBush && closestBush.currentBerries > 0) {
      human.activeAction = 'moving';
      human.targetPosition = { ...closestBush.position };
      const dirToTarget = vectorSubtract(closestBush.position, human.position);
      human.direction = vectorNormalize(dirToTarget);
      return; // Decision made for this tick
    } else {
      // No suitable bush found, become idle
      human.activeAction = 'idle';
      human.direction = { x: 0, y: 0 };
      human.targetPosition = undefined;
      return; // Decision made for this tick
    }
  }

  // ============================================================
  // 3. IDLE/WANDER LOGIC (LOWEST PRIORITY)
  // ============================================================

  // If idle, maybe start wandering
  if (human.activeAction === 'idle' || !human.activeAction) {
    human.activeAction = 'idle'; // Ensure activeAction is set

    if (Math.random() < HUMAN_AI_IDLE_WANDER_CHANCE) {
      // Start wandering
      human.activeAction = 'moving';
      human.targetPosition = getRandomNearbyPosition(
        human.position,
        HUMAN_AI_WANDER_RADIUS,
        gameState.mapDimensions.width,
        gameState.mapDimensions.height,
      );
      const dirToTarget = vectorSubtract(human.targetPosition, human.position);
      human.direction = vectorNormalize(dirToTarget);
    } else {
      // Stay idle
      human.direction = { x: 0, y: 0 };
      human.targetPosition = undefined;
    }
    return; // Decision made for this tick
  }

  // If wandering (moving without gathering purpose)
  if (human.activeAction === 'moving' && human.targetPosition) {
    const distanceToTarget = vectorDistance(human.position, human.targetPosition);

    // Arrived at wander destination
    if (distanceToTarget < HUMAN_INTERACTION_RANGE) {
      human.activeAction = 'idle';
      human.targetPosition = undefined;
      human.direction = { x: 0, y: 0 };
    }
    return; // Continue wandering or just switched to idle
  }

  // Fallback: If we somehow reached here with an undefined state, reset to idle
  human.activeAction = 'idle';
  human.direction = { x: 0, y: 0 };
  human.targetPosition = undefined;
}