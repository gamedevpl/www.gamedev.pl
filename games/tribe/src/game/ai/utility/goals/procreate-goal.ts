import { HumanEntity } from '../../../entities/characters/human/human-types';
import {
  HUMAN_FEMALE_MAX_PROCREATION_AGE,
  HUMAN_HUNGER_THRESHOLD_CRITICAL,
  HUMAN_MALE_URGENT_PROCREATION_AGE,
  HUMAN_MIN_PROCREATION_AGE,
  PROCREATION_FOOD_SEARCH_RADIUS,
  PROCREATION_MIN_NEARBY_BERRY_BUSHES,
} from '../../../world-consts';
import { UpdateContext } from '../../../world-types';
import { Goal, GoalType } from './goal-types';
import { countEntitiesOfTypeInRadius, countLivingOffspring } from '../../../utils/world-utils';
import { EntityType } from '../../../entities/entities-types';

export class ProcreateGoal implements Goal {
  public type = GoalType.PROCREATE;

  public getScore(human: HumanEntity, context: UpdateContext): number {
    const { gameState } = context;

    // --- Basic disqualifiers ---
    if (
      !human.isAdult ||
      human.hunger >= HUMAN_HUNGER_THRESHOLD_CRITICAL ||
      (human.procreationCooldown || 0) > 0 ||
      (human.gender === 'female' && (human.isPregnant || human.age > HUMAN_FEMALE_MAX_PROCREATION_AGE))
    ) {
      return 0;
    }

    // --- Environmental check ---
    const nearbyBerryBushesCount = countEntitiesOfTypeInRadius(
      human.position,
      gameState,
      'berryBush' as EntityType,
      PROCREATION_FOOD_SEARCH_RADIUS,
    );
    if (nearbyBerryBushesCount < PROCREATION_MIN_NEARBY_BERRY_BUSHES) {
      return 0; // Not enough food to support a child
    }

    // --- Urgency checks ---
    // 1. Male urgently needs an heir
    if (
      human.gender === 'male' &&
      human.age > HUMAN_MALE_URGENT_PROCREATION_AGE &&
      countLivingOffspring(human.id, gameState) === 0
    ) {
      return 1.0; // Maximum urgency
    }

    // --- General desire based on age ---
    let ageScore = 0;
    if (human.gender === 'female') {
      // Score increases as female approaches max procreation age
      ageScore =
        (human.age - HUMAN_MIN_PROCREATION_AGE) / (HUMAN_FEMALE_MAX_PROCREATION_AGE - HUMAN_MIN_PROCREATION_AGE);
    } else {
      // Male desire increases steadily with age
      ageScore = (human.age - HUMAN_MIN_PROCREATION_AGE) / (human.maxAge - HUMAN_MIN_PROCREATION_AGE);
    }

    // Clamp the score and add a small base desire
    const finalScore = 0.1 + ageScore * 0.7; // Base desire + age-based desire, maxing out at 0.8 for non-urgent cases

    return Math.max(0, Math.min(finalScore, 1));
  }
}

export const procreateGoal = new ProcreateGoal();
