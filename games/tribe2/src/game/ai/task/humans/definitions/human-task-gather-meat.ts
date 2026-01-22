import { HumanEntity } from '../../../../entities/characters/human/human-types';
import { CorpseEntity } from '../../../../entities/characters/corpse-types';
import { HUMAN_HUNGER_DEATH, HUMAN_INTERACTION_RANGE } from '../../../../human-consts';
import { calculateWrappedDistance } from '../../../../utils/math-utils';
import { TaskResult, TaskType } from '../../task-types';
import { getDistanceScore } from '../../task-utils';
import { defineHumanTask } from '../human-task-utils';
import { isWithinOperatingRange } from '../../../../entities/tribe/territory-utils';

export const humanGatherMeatDefinition = defineHumanTask<HumanEntity>({
  type: TaskType.HumanGatherMeat,
  requireAdult: true,
  scorer: (human, task, context) => {
    if (typeof task.target !== 'number') {
      return null;
    }

    const corpse = context.gameState.entities.entities[task.target] as CorpseEntity | undefined;
    if (!corpse || corpse.type !== 'corpse' || corpse.food.length === 0) {
      return null;
    }

    // Check operating range
    if (human.leaderId && !isWithinOperatingRange(corpse.position, human.leaderId, context.gameState)) {
      return null;
    }

    if (human.food.length >= human.maxFood) {
      return null;
    }

    const distance = calculateWrappedDistance(
      human.position,
      corpse.position,
      context.gameState.mapDimensions.width,
      context.gameState.mapDimensions.height,
    );

    // Distance factor: closer is better (0 to 1)
    const distanceFactor = getDistanceScore(distance);

    // Hunger factor: hungrier humans prioritize food gathering more
    const hungerFactor = human.hunger / HUMAN_HUNGER_DEATH;

    // Base score + hunger weight (normalized 0-1)
    return (distanceFactor + hungerFactor) / 2;
  },
  executor: (task, human, context) => {
    if (typeof task.target !== 'number') {
      return TaskResult.Failure;
    }

    const corpse = context.gameState.entities.entities[task.target] as CorpseEntity | undefined;
    if (!corpse || corpse.type !== 'corpse' || corpse.food.length === 0 || human.food.length >= human.maxFood) {
      return TaskResult.Success; // Task is "done" if corpse is gone, empty, or human is full
    }

    const distance = calculateWrappedDistance(
      human.position,
      corpse.position,
      context.gameState.mapDimensions.width,
      context.gameState.mapDimensions.height,
    );

    if (distance > HUMAN_INTERACTION_RANGE) {
      human.target = corpse.position;
      human.activeAction = 'moving';
      return TaskResult.Running;
    }

    // At the corpse, start gathering
    human.direction = { x: 0, y: 0 };
    human.target = corpse.id;
    human.activeAction = 'gathering';

    return TaskResult.Running;
  },
});
