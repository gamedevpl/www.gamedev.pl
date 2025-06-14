import { HumanEntity } from '../../entities/characters/human/human-types';
import { UpdateContext } from '../../world-types';
import { BerryBushEntity } from '../../entities/plants/berry-bush/berry-bush-types';
import { vectorDistance, vectorNormalize, vectorSubtract } from '../../utils/math-utils';
import { findClosestEntity, areFamily } from '../../utils/world-utils';
import {
  HUMAN_AI_HUNGER_THRESHOLD_FOR_GATHERING,
  HUMAN_INTERACTION_RANGE,
  AI_GATHERING_TERRITORY_RADIUS,
} from '../../world-consts';
import { EntityType } from '../../entities/entities-types';
import { HumanAIStrategy } from './ai-strategy-types';

export class GatheringStrategy implements HumanAIStrategy {
  check(human: HumanEntity): boolean {
    // Non-adult children should not gather resources
    if (!human.isAdult) {
      return false;
    }

    // Check if human needs to gather (hungry enough and not at berry capacity)
    if (human.hunger >= HUMAN_AI_HUNGER_THRESHOLD_FOR_GATHERING && human.berries < human.maxBerries) {
      return true;
    }
    return false;
  }

  execute(human: HumanEntity, context: UpdateContext): void {
    const { gameState } = context;
    const allEntities = gameState.entities.entities;

    // 1. Categorize all available berry bushes
    const myBushes: BerryBushEntity[] = [];
    const familyBushes: BerryBushEntity[] = [];
    const unclaimedBushes: BerryBushEntity[] = [];

    for (const entity of allEntities.values()) {
      if (entity.type === 'berryBush') {
        const bush = entity as BerryBushEntity;
        if (bush.currentBerries > 0) {
          if (bush.ownerId === human.id) {
            myBushes.push(bush);
          } else if (!bush.ownerId) {
            unclaimedBushes.push(bush);
          } else {
            const owner = allEntities.get(bush.ownerId) as HumanEntity | undefined;
            if (owner && areFamily(human, owner, allEntities)) {
              familyBushes.push(bush);
            }
            // Ignore bushes owned by non-family for now
          }
        }
      }
    }

    let targetBush: BerryBushEntity | null = null;

    // 2. Territorial Search: If I own bushes, try to gather near them
    if (myBushes.length > 0) {
      const preferredTargets = [...myBushes, ...unclaimedBushes, ...familyBushes];
      let closestTerritorialBush: BerryBushEntity | null = null;
      let minDistance = Infinity;

      for (const ownedBush of myBushes) {
        for (const target of preferredTargets) {
          if (target.id === ownedBush.id) continue; // Don't target a bush we're using as an anchor
          const distanceToAnchor = vectorDistance(ownedBush.position, target.position);

          if (distanceToAnchor <= AI_GATHERING_TERRITORY_RADIUS) {
            const distanceToTarget = vectorDistance(human.position, target.position);
            if (distanceToTarget < minDistance) {
              minDistance = distanceToTarget;
              closestTerritorialBush = target;
            }
          }
        }
      }
      targetBush = closestTerritorialBush;
    }

    // 3. Prioritized Global Search (Fallback)
    if (!targetBush) {
      const searchOrder = [myBushes, unclaimedBushes, familyBushes];
      for (const bushList of searchOrder) {
        if (bushList.length > 0) {
          targetBush = findClosestEntity<BerryBushEntity>(
            human,
            new Map(bushList.map((b) => [b.id, b])), // Create a map for findClosestEntity
            'berryBush' as EntityType,
            gameState.mapDimensions.width,
            gameState.mapDimensions.height,
          );
          if (targetBush) {
            break; // Found a target in the current priority list
          }
        }
      }
    }

    // 4. Update AI Action
    if (targetBush) {
      const distance = vectorDistance(human.position, targetBush.position);
      if (distance < HUMAN_INTERACTION_RANGE) {
        human.activeAction = 'gathering';
        human.direction = { x: 0, y: 0 };
        human.targetPosition = undefined;
      } else {
        human.activeAction = 'moving';
        human.targetPosition = { ...targetBush.position };
        const dirToTarget = vectorSubtract(targetBush.position, human.position);
        human.direction = vectorNormalize(dirToTarget);
      }
    } else {
      // No suitable bush found, become idle
      human.activeAction = 'idle';
      human.direction = { x: 0, y: 0 };
      human.targetPosition = undefined;
    }
  }
}
