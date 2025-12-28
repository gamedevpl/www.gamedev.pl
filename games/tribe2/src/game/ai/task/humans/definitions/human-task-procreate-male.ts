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

export const humanProcreateMaleDefinition: TaskDefinition<HumanEntity> = {
  type: TaskType.HumanProcreateMale,
  producer: (human, context) => {
    const tasks: Record<string, Task> = {};

    const isFertile =
      human.isAdult &&
      human.gender === 'male' &&
      human.age >= HUMAN_MIN_PROCREATION_AGE &&
      human.hunger < HUMAN_HUNGER_THRESHOLD_CRITICAL &&
      (human.procreationCooldown || 0) <= 0;

    if (isFertile) {
      const taskId = `procreate-male-task-${human.id}`;
      tasks[taskId] = {
        id: taskId,
        type: TaskType.HumanProcreateMale,
        creatorEntityId: human.id,
        target: human.id,
        validUntilTime: context.gameState.time + TASK_DEFAULT_VALIDITY_DURATION,
      };
    }

    return tasks;
  },
  scorer: (female: HumanEntity, task: Task, context: UpdateContext) => {
    // Only females can claim this task
    if (female.gender !== 'female' || !female.isAdult || female.isPregnant) {
      return null;
    }

    // Check female's own fertility/readiness
    if (
      female.age < HUMAN_MIN_PROCREATION_AGE ||
      female.age > HUMAN_FEMALE_MAX_PROCREATION_AGE ||
      female.hunger >= HUMAN_HUNGER_THRESHOLD_CRITICAL ||
      (female.procreationCooldown || 0) > 0
    ) {
      return null;
    }

    // Check autopilot if player
    if (female.isPlayer && !context.gameState.autopilotControls.behaviors.procreation) {
      return null;
    }

    const male = context.gameState.entities.entities[task.creatorEntityId] as HumanEntity | undefined;
    if (!male || male.gender !== 'male' || male.hunger >= HUMAN_HUNGER_THRESHOLD_CRITICAL) {
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
    const distanceFactor = 1 / (1 + distance / 500);

    // Base score for procreation
    return distanceFactor * 0.8;
  },
  executor: (task: Task, female: HumanEntity, context: UpdateContext) => {
    const male = context.gameState.entities.entities[task.creatorEntityId] as HumanEntity | undefined;

    // If male is gone or no longer eligible, fail the task
    if (!male || male.gender !== 'male' || male.hunger >= HUMAN_HUNGER_THRESHOLD_CRITICAL) {
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
};
