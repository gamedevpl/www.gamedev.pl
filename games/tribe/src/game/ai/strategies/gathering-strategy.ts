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
import { IndexedWorldState } from '../../world-index/world-index-types';

export class GatheringStrategy implements HumanAIStrategy {
  check(human: HumanEntity): boolean {
    if (!human.isAdult) {
      return false;
    }

    if (human.hunger >= HUMAN_AI_HUNGER_THRESHOLD_FOR_GATHERING && human.berries < human.maxBerries) {
      return true;
    }
    return false;
  }

  execute(human: HumanEntity, context: UpdateContext): void {
    const { gameState } = context;
    const indexedState = gameState as IndexedWorldState;

    const myBushes = indexedState.search.berryBush.byProperty('ownerId', human.id).filter((b) => b.currentBerries > 0);
    const unclaimedBushes = indexedState.search.berryBush.byProperty('ownerId', undefined).filter((b) => b.currentBerries > 0);
    const familyBushes = indexedState.search.berryBush
      .byProperty('ownerId', undefined)
      .filter((b) => {
        if (b.ownerId && b.currentBerries > 0) {
          const owner = gameState.entities.entities.get(b.ownerId) as HumanEntity | undefined;
          return owner && areFamily(human, owner, gameState);
        }
        return false;
      });

    let targetBush: BerryBushEntity | null = null;

    if (myBushes.length > 0) {
      const preferredTargets = [...myBushes, ...unclaimedBushes, ...familyBushes];
      let closestTerritorialBush: BerryBushEntity | null = null;
      let minDistance = Infinity;

      for (const ownedBush of myBushes) {
        const candidates = indexedState.search.berryBush.byRadius(ownedBush.position, AI_GATHERING_TERRITORY_RADIUS);
        for (const target of candidates) {
          if (preferredTargets.find((p) => p.id === target.id)) {
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

    if (!targetBush) {
      const searchOrder = [myBushes, unclaimedBushes, familyBushes];
      for (const bushList of searchOrder) {
        if (bushList.length > 0) {
          targetBush = findClosestEntity<BerryBushEntity>(
            human,
            gameState,
            'berryBush' as EntityType,
            undefined,
            (b) => bushList.some((bl) => bl.id === b.id),
          );
          if (targetBush) {
            break;
          }
        }
      }
    }

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
      human.activeAction = 'idle';
      human.direction = { x: 0, y: 0 };
      human.targetPosition = undefined;
    }
  }
}
