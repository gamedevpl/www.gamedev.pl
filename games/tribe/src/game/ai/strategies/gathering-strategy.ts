import { HumanEntity } from '../../entities/characters/human/human-types';
import { UpdateContext } from '../../world-types';
import { BerryBushEntity } from '../../entities/plants/berry-bush/berry-bush-types';
import { vectorDistance, vectorNormalize, vectorSubtract } from '../../utils/math-utils';
import { findClosestEntity } from '../../utils/world-utils';
import { HUMAN_AI_HUNGER_THRESHOLD_FOR_GATHERING, HUMAN_INTERACTION_RANGE } from '../../world-consts';
import { EntityType } from '../../entities/entities-types';
import { HumanAIStrategy } from './ai-strategy-types';

export class GatheringStrategy implements HumanAIStrategy {
  check(human: HumanEntity): boolean {
    // Non-adult children should not gather resources
    if (!human.isAdult) {
      return false;
    }

    // Check if human needs to gather (hungry enough and not at berry capacity)
    if (human.hunger >= HUMAN_AI_HUNGER_THRESHOLD_FOR_GATHERING && human.berries < human.maxBerries / 2) {
      return true;
    }
    return false;
  }

  execute(human: HumanEntity, context: UpdateContext): void {
    const { gameState } = context;

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
        return; // Became idle because full
      }

      // Validate if there's a viable bush at the current location to continue gathering
      const bushAtLocation = findClosestEntity<BerryBushEntity>(
        human,
        gameState.entities.entities,
        'berryBush' as EntityType,
        gameState.mapDimensions.width,
        gameState.mapDimensions.height,
        HUMAN_INTERACTION_RANGE, // Check only within immediate interaction range
        (bush) => (bush as BerryBushEntity).currentBerries > 0,
      );

      if (!bushAtLocation) {
        // No viable bush at current location, or bush is depleted. Switch to idle.
        human.activeAction = 'idle';
        human.direction = { x: 0, y: 0 };
        human.targetPosition = undefined;
      }
      return; // Continue gathering or switched to idle
    }

    // Not moving to gather and not gathering - find a berry bush
    const closestBush = findClosestEntity<BerryBushEntity>(
      human,
      gameState.entities.entities,
      'berryBush' as EntityType,
      gameState.mapDimensions.width,
      gameState.mapDimensions.height,
      HUMAN_INTERACTION_RANGE * 10, // Search in a wider range
      (bush) => (bush as BerryBushEntity).currentBerries > 0,
    );

    if (closestBush && closestBush.currentBerries > 0) {
      human.activeAction = 'moving';
      human.targetPosition = { ...closestBush.position };
      const dirToTarget = vectorSubtract(closestBush.position, human.position);
      human.direction = vectorNormalize(dirToTarget);
    } else {
      // No suitable bush found, become idle
      human.activeAction = 'idle';
      human.direction = { x: 0, y: 0 };
      human.targetPosition = undefined;
    }
  }
}
