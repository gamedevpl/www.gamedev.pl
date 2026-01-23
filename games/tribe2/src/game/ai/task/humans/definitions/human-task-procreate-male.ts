import { HumanEntity } from '../../../../entities/characters/human/human-types';
import {
  HUMAN_FEMALE_MAX_PROCREATION_AGE,
  HUMAN_HUNGER_DEATH,
  HUMAN_HUNGER_THRESHOLD_CRITICAL,
  HUMAN_INTERACTION_RANGE,
  HUMAN_MIN_PROCREATION_AGE,
} from '../../../../human-consts';
import { calculateWrappedDistance, dirToTarget } from '../../../../utils/math-utils';
import { TASK_DEFAULT_VALIDITY_DURATION, TASK_PROCREATION_SCORE_MULTIPLIER } from '../../task-consts';
import { Task, TaskResult, TaskType } from '../../task-types';
import { getDistanceScore } from '../../task-utils';
import { defineHumanTask, getStrategyMultiplier } from '../human-task-utils';
import { StrategicObjective } from '../../../../entities/tribe/tribe-types';

export const humanProcreateMaleDefinition = defineHumanTask<HumanEntity>({
  type: TaskType.HumanProcreateMale,
  requireAdult: true,
  producer: (human, context) => {
    const tasks: Record<string, Task> = {};

    const isBabyBoom = getStrategyMultiplier(human, context, StrategicObjective.BabyBoom, 2) === 2;
    const hungerThreshold = isBabyBoom ? HUMAN_HUNGER_DEATH * 0.95 : HUMAN_HUNGER_THRESHOLD_CRITICAL;

    const isFertile =
      human.gender === 'male' &&
      human.age >= HUMAN_MIN_PROCREATION_AGE &&
      human.hunger < hungerThreshold &&
      (human.procreationCooldown || 0) <= 0;

    if (isFertile) {
      const taskId = `procreate-male-task-${human.id}`;
      tasks[taskId] = {
        id: taskId,
        type: TaskType.HumanProcreateMale,
        position: human.position,
        creatorEntityId: human.id,
        target: human.id,
        validUntilTime: context.gameState.time + TASK_DEFAULT_VALIDITY_DURATION,
      };
    }

    return tasks;
  },
  scorer: (female, task, context) => {
    // Only females can claim this task
    if (female.gender !== 'female' || female.isPregnant) {
      return null;
    }

    const isBabyBoom = getStrategyMultiplier(female, context, StrategicObjective.BabyBoom, 2) === 2;
    const hungerThreshold = isBabyBoom ? HUMAN_HUNGER_DEATH * 0.95 : HUMAN_HUNGER_THRESHOLD_CRITICAL;

    // Check female's own fertility/readiness
    if (
      female.age < HUMAN_MIN_PROCREATION_AGE ||
      female.age > HUMAN_FEMALE_MAX_PROCREATION_AGE ||
      female.hunger >= hungerThreshold ||
      (female.procreationCooldown || 0) > 0
    ) {
      return null;
    }

    const male = context.gameState.entities.entities[task.creatorEntityId] as HumanEntity | undefined;
    if (!male || male.gender !== 'male' || male.hunger >= hungerThreshold) {
      return null;
    }

    // Tribe check: must be in same tribe or at least one tribeless
    if (female.leaderId && male.leaderId && female.leaderId !== male.leaderId) {
      return null;
    }

    const distance = calculateWrappedDistance(
      female.position,
      male.position,
      context.gameState.mapDimensions.width,
      context.gameState.mapDimensions.height,
    );

    // Distance factor: closer is better (0 to 1)
    const distanceFactor = getDistanceScore(distance);

    // Base score for procreation
    const baseScore = distanceFactor * TASK_PROCREATION_SCORE_MULTIPLIER;
    return baseScore * getStrategyMultiplier(female, context, StrategicObjective.BabyBoom, 4.0);
  },
  executor: (task, female, context) => {
    const male = context.gameState.entities.entities[task.creatorEntityId] as HumanEntity | undefined;

    // If male is gone or no longer eligible, fail the task
    if (!male || male.gender !== 'male' || male.hunger >= HUMAN_HUNGER_DEATH) {
      return TaskResult.Failure;
    }

    if (female.isPregnant) {
      return TaskResult.Success;
    }

    const distance = calculateWrappedDistance(
      female.position,
      male.position,
      context.gameState.mapDimensions.width,
      context.gameState.mapDimensions.height,
    );

    if (distance > HUMAN_INTERACTION_RANGE) {
      female.target = male.position;
      female.activeAction = 'moving';
      female.direction = dirToTarget(female.position, male.position, context.gameState.mapDimensions);
      return TaskResult.Running;
    }

    // In range, initiate procreation
    female.direction = { x: 0, y: 0 };
    female.target = male.id;
    female.activeAction = 'procreating';

    return TaskResult.Running;
  },
});
