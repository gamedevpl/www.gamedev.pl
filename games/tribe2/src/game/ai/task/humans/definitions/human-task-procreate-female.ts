import { HumanEntity } from '../../../../entities/characters/human/human-types';
import {
  HUMAN_FEMALE_MAX_PROCREATION_AGE,
  HUMAN_HUNGER_THRESHOLD_CRITICAL,
  HUMAN_INTERACTION_RANGE,
  HUMAN_MIN_PROCREATION_AGE,
} from '../../../../human-consts';
import { calculateWrappedDistance, dirToTarget } from '../../../../utils/math-utils';
import { UpdateContext } from '../../../../world-types';
import { TASK_DEFAULT_VALIDITY_DURATION } from '../../task-consts';
import { Task, TaskDefinition, TaskResult, TaskType } from '../../task-types';

export const humanProcreateFemaleDefinition: TaskDefinition<HumanEntity> = {
  type: TaskType.HumanProcreateFemale,
  producer: (human, context) => {
    const tasks: Record<string, Task> = {};

    const isFertile =
      human.isAdult &&
      human.gender === 'female' &&
      !human.isPregnant &&
      human.age >= HUMAN_MIN_PROCREATION_AGE &&
      human.age <= HUMAN_FEMALE_MAX_PROCREATION_AGE &&
      human.hunger < HUMAN_HUNGER_THRESHOLD_CRITICAL &&
      (human.procreationCooldown || 0) <= 0;

    if (isFertile) {
      const taskId = `procreate-female-task-${human.id}`;
      tasks[taskId] = {
        id: taskId,
        type: TaskType.HumanProcreateFemale,
        creatorEntityId: human.id,
        target: human.id,
        validUntilTime: context.gameState.time + TASK_DEFAULT_VALIDITY_DURATION,
      };
    }

    return tasks;
  },
  scorer: (male: HumanEntity, task: Task, context: UpdateContext) => {
    // Only males can claim this task
    if (male.gender !== 'male' || !male.isAdult) {
      return null;
    }

    // Check male's own fertility/readiness
    if (
      male.age < HUMAN_MIN_PROCREATION_AGE ||
      male.hunger >= HUMAN_HUNGER_THRESHOLD_CRITICAL ||
      (male.procreationCooldown || 0) > 0
    ) {
      return null;
    }

    // Check autopilot if player
    if (male.isPlayer && !context.gameState.autopilotControls.behaviors.procreation) {
      return null;
    }

    const female = context.gameState.entities.entities[task.creatorEntityId] as HumanEntity | undefined;
    if (!female || female.gender !== 'female' || female.isPregnant) {
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
    const distanceFactor = 1 / (1 + distance / 500);

    // Base score for procreation
    return distanceFactor * 0.8;
  },
  executor: (task: Task, male: HumanEntity, context: UpdateContext) => {
    const female = context.gameState.entities.entities[task.creatorEntityId] as HumanEntity | undefined;

    // If female is gone or no longer eligible, fail the task
    if (!female || female.gender !== 'female' || male.hunger >= HUMAN_HUNGER_THRESHOLD_CRITICAL) {
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
};
