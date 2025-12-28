import { HumanEntity } from '../../../../entities/characters/human/human-types';
import {
  CHILD_HUNGER_THRESHOLD_FOR_REQUESTING_FOOD,
  HUMAN_HUNGER_DEATH,
  PARENT_FEEDING_RANGE,
} from '../../../../human-consts';
import { calculateWrappedDistance, dirToTarget } from '../../../../utils/math-utils';
import { UpdateContext } from '../../../../world-types';
import { TASK_DEFAULT_VALIDITY_DURATION } from '../../task-consts';
import { Task, TaskDefinition, TaskResult, TaskType } from '../../task-types';

export const humanFeedChildDefinition: TaskDefinition<HumanEntity> = {
  type: TaskType.HumanFeedChild,
  producer: (child, context) => {
    const tasks: Record<string, Task> = {};

    if (!child.isAdult && child.hunger >= CHILD_HUNGER_THRESHOLD_FOR_REQUESTING_FOOD) {
      const taskId = `feed-child-task-${child.id}`;
      tasks[taskId] = {
        id: taskId,
        type: TaskType.HumanFeedChild,
        creatorEntityId: child.id,
        target: child.id,
        validUntilTime: context.gameState.time + TASK_DEFAULT_VALIDITY_DURATION,
      };
    }

    return tasks;
  },
  scorer: (adult: HumanEntity, task: Task, context: UpdateContext) => {
    // Only adults with food can claim this task
    if (!adult.isAdult || adult.food.length === 0 || (adult.feedChildCooldownTime || 0) > 0) {
      return null;
    }

    // Check autopilot if player
    if (adult.isPlayer && !context.gameState.autopilotControls.behaviors.feedChildren) {
      return null;
    }

    const child = context.gameState.entities.entities[task.creatorEntityId] as HumanEntity | undefined;
    if (!child || child.isAdult) {
      return null;
    }

    // Only parents can feed their children
    const isParent = child.motherId === adult.id || child.fatherId === adult.id;
    if (!isParent) {
      return null;
    }

    const distance = calculateWrappedDistance(
      adult.position,
      child.position,
      context.gameState.mapDimensions.width,
      context.gameState.mapDimensions.height,
    );

    // Distance factor: closer is better (0 to 1)
    const distanceFactor = 1 / (1 + distance / 500);

    // Child hunger factor: hungrier children get higher priority
    const hungerFactor = child.hunger / HUMAN_HUNGER_DEATH;

    // Base score for feeding child
    return distanceFactor * (0.5 + hungerFactor);
  },
  executor: (task: Task, adult: HumanEntity, context: UpdateContext) => {
    const child = context.gameState.entities.entities[task.creatorEntityId] as HumanEntity | undefined;

    // If child is gone, grown up, or adult ran out of food, fail/complete the task
    if (!child || child.isAdult || adult.food.length === 0) {
      return TaskResult.Failure;
    }

    // If child is no longer hungry enough, task is done
    if (child.hunger < CHILD_HUNGER_THRESHOLD_FOR_REQUESTING_FOOD / 2) {
      return TaskResult.Success;
    }

    const distance = calculateWrappedDistance(
      adult.position,
      child.position,
      context.gameState.mapDimensions.width,
      context.gameState.mapDimensions.height,
    );

    if (distance > PARENT_FEEDING_RANGE) {
      adult.target = child.position;
      adult.activeAction = 'moving';
      adult.direction = dirToTarget(adult.position, child.position, context.gameState.mapDimensions);
      return TaskResult.Running;
    }

    // In range, initiate feeding
    adult.direction = { x: 0, y: 0 };
    adult.target = child.id;
    adult.activeAction = 'feeding';

    return TaskResult.Running;
  },
};
