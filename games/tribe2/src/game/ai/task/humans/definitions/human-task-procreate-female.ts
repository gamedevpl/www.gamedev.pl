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

export const humanProcreateFemaleDefinition = defineHumanTask<HumanEntity>({
  type: TaskType.HumanProcreateFemale,
  requireAdult: true,
  producer: (human, context) => {
    const tasks: Record<string, Task> = {};

    const isBabyBoom = getStrategyMultiplier(human, context, StrategicObjective.BabyBoom, 2) === 2;
    const hungerThreshold = isBabyBoom ? HUMAN_HUNGER_DEATH * 0.95 : HUMAN_HUNGER_THRESHOLD_CRITICAL;

    const isFertile =
      human.gender === 'female' &&
      !human.isPregnant &&
      human.age >= HUMAN_MIN_PROCREATION_AGE &&
      human.age <= HUMAN_FEMALE_MAX_PROCREATION_AGE &&
      human.hunger < hungerThreshold &&
      (human.procreationCooldown || 0) <= 0;

    if (isFertile) {
      const taskId = `procreate-female-task-${human.id}`;
      tasks[taskId] = {
        id: taskId,
        type: TaskType.HumanProcreateFemale,
        position: human.position,
        creatorEntityId: human.id,
        target: human.id,
        validUntilTime: context.gameState.time + TASK_DEFAULT_VALIDITY_DURATION,
      };
    }

    return tasks;
  },
  scorer: (male, task, context) => {
    // Only males can claim this task
    if (male.gender !== 'male') {
      return null;
    }

    const isBabyBoom = getStrategyMultiplier(male, context, StrategicObjective.BabyBoom, 2) === 2;
    const hungerThreshold = isBabyBoom ? HUMAN_HUNGER_DEATH * 0.95 : HUMAN_HUNGER_THRESHOLD_CRITICAL;

    // Check male's own fertility/readiness
    if (
      male.age < HUMAN_MIN_PROCREATION_AGE ||
      male.hunger >= hungerThreshold ||
      (male.procreationCooldown || 0) > 0
    ) {
      return null;
    }

    const female = context.gameState.entities.entities[task.creatorEntityId] as HumanEntity | undefined;
    if (!female || female.gender !== 'female' || female.isPregnant || female.hunger >= hungerThreshold) {
      return null;
    }

    // Tribe check: must be in same tribe or at least one tribeless
    if (male.leaderId && female.leaderId && male.leaderId !== female.leaderId) {
      return null;
    }

    const distance = calculateWrappedDistance(
      male.position,
      female.position,
      context.gameState.mapDimensions.width,
      context.gameState.mapDimensions.height,
    );

    // Distance factor: closer is better (0 to 1)
    const distanceFactor = getDistanceScore(distance);

    // Base score for procreation
    const baseScore = distanceFactor * TASK_PROCREATION_SCORE_MULTIPLIER;
    return baseScore * getStrategyMultiplier(male, context, StrategicObjective.BabyBoom, 4.0);
  },
  executor: (task, male, context) => {
    const female = context.gameState.entities.entities[task.creatorEntityId] as HumanEntity | undefined;

    // If female is gone or no longer eligible, fail the task
    if (!female || female.gender !== 'female' || male.hunger >= HUMAN_HUNGER_DEATH) {
      return TaskResult.Failure;
    }

    if (female.isPregnant) {
      return TaskResult.Success;
    }

    const distance = calculateWrappedDistance(
      male.position,
      female.position,
      context.gameState.mapDimensions.width,
      context.gameState.mapDimensions.height,
    );

    if (distance > HUMAN_INTERACTION_RANGE) {
      male.target = female.position;
      male.activeAction = 'moving';
      male.direction = dirToTarget(male.position, female.position, context.gameState.mapDimensions);
      return TaskResult.Running;
    }

    // In range, initiate procreation
    male.direction = { x: 0, y: 0 };
    male.target = female.id;
    male.activeAction = 'procreating';

    return TaskResult.Running;
  },
});
