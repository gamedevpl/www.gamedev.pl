import { HumanEntity } from '../../entities/characters/human/human-types';
import { UpdateContext } from '../../world-types';
import { areFamily } from '../../utils/world-utils';
import {
  AI_DEFEND_CLAIMED_BUSH_RANGE,
  HUMAN_AI_HUNGER_THRESHOLD_FOR_EATING,
  KARMA_ENEMY_THRESHOLD,
  EFFECT_DURATION_SHORT_HOURS,
  AI_DEFEND_BUSH_RANGE,
} from '../../world-consts';
import { HumanAIStrategy } from './ai-strategy-types';
import { addVisualEffect } from '../../utils/visual-effects-utils';
import { VisualEffectType } from '../../visual-effects/visual-effect-types';
import { IndexedWorldState } from '../../world-index/world-index-types';
import { calculateWrappedDistance } from '../../utils/math-utils';

export class DefendingClaimedBushStrategy implements HumanAIStrategy<HumanEntity> {
  check(human: HumanEntity, context: UpdateContext): HumanEntity | null {
    const { gameState } = context;
    const indexedState = gameState as IndexedWorldState;

    // Strategy applies only to adults who are not too hungry to fight.
    if (!human.isAdult || human.hunger > HUMAN_AI_HUNGER_THRESHOLD_FOR_EATING) {
      return null;
    }

    // Find all bushes owned by this human.
    const ownedBushes = indexedState.search.berryBush.byProperty('ownerId', human.id);
    if (ownedBushes.length === 0) {
      return null;
    }

    for (const bush of ownedBushes) {
      // Find potential intruders near the claimed bush.
      const nearbyHumans = indexedState.search.human.byRadius(bush.position, AI_DEFEND_CLAIMED_BUSH_RANGE);

      for (const potentialIntruder of nearbyHumans) {
        // Check if the nearby human is a valid intruder.
        if (
          potentialIntruder.id !== human.id && // Not the owner
          !areFamily(human, potentialIntruder, gameState) && // Not family
          (human.karma[potentialIntruder.id] || 0) < KARMA_ENEMY_THRESHOLD // Is an enemy or neutral/disliked
        ) {
          // Check if the intruder is close enough to the bush to be considered gathering from it.
          const distanceToBush = calculateWrappedDistance(
            potentialIntruder.position,
            bush.position,
            gameState.mapDimensions.width,
            gameState.mapDimensions.height,
          );

          if (distanceToBush < AI_DEFEND_BUSH_RANGE) {
            // Found a valid intruder to attack.
            return potentialIntruder;
          }
        }
      }
    }

    return null;
  }

  execute(human: HumanEntity, context: UpdateContext, intruder: HumanEntity): void {
    // Add a visual effect to show that a target has been acquired.
    if (
      !human.lastTargetAcquiredEffectTime ||
      context.gameState.time - human.lastTargetAcquiredEffectTime > EFFECT_DURATION_SHORT_HOURS * 5
    ) {
      addVisualEffect(
        context.gameState,
        VisualEffectType.TargetAcquired,
        human.position,
        EFFECT_DURATION_SHORT_HOURS,
        human.id,
      );
      human.lastTargetAcquiredEffectTime = context.gameState.time;
    }

    // Set the human's action to attack the intruder.
    human.activeAction = 'attacking';
    human.attackTargetId = intruder.id;
    human.targetPosition = undefined; // Clear any previous movement target.
  }
}
