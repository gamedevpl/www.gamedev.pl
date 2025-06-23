import { HumanEntity } from '../../entities/characters/human/human-types';
import { UpdateContext } from '../../world-types';
import {
  AI_FLEE_HEALTH_THRESHOLD,
  AI_SEIZE_MIN_NON_FAMILY_TARGETS,
  HUMAN_AI_HUNGER_THRESHOLD_FOR_EATING,
  SEIZE_PERIMETER_RADIUS,
} from '../../world-consts';
import { HumanAIStrategy } from './ai-strategy-types';
import { isFamilyHeadWithoutLivingFather } from '../../utils/world-utils';

export class SeizingStrategy implements HumanAIStrategy<boolean> {
  check(human: HumanEntity, context: UpdateContext): boolean {
    const { gameState } = context;

    // Only leaders can seize
    if (human.leaderId !== human.id) {
      return false;
    }

    if (!isFamilyHeadWithoutLivingFather(human, gameState)) {
      return false;
    }

    if ((human.seizeCooldown || 0) > 0) {
      return false;
    }

    if (human.hitpoints / human.maxHitpoints < AI_FLEE_HEALTH_THRESHOLD) {
      return false;
    }

    if (human.hunger > HUMAN_AI_HUNGER_THRESHOLD_FOR_EATING) {
      return false;
    }

    let nonTribeCount = 0;
    let tribeCount = 0;
    for (const otherEntity of gameState.entities.entities.values()) {
      if (otherEntity.type === 'human' && otherEntity.id !== human.id) {
        const otherHuman = otherEntity as HumanEntity;
        const distance = Math.sqrt(
          (human.position.x - otherHuman.position.x) ** 2 + (human.position.y - otherHuman.position.y) ** 2,
        );
        if (distance <= SEIZE_PERIMETER_RADIUS) {
          if (otherHuman.leaderId !== human.leaderId) {
            nonTribeCount++;
          } else {
            tribeCount++;
          }
        }
      }
    }

    return nonTribeCount >= AI_SEIZE_MIN_NON_FAMILY_TARGETS && tribeCount > nonTribeCount;
  }

  execute(human: HumanEntity): void {
    human.activeAction = 'seizing';
  }
}
