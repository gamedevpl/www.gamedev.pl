import { HumanEntity } from '../../../../entities/characters/human/human-types';
import { BerryBushEntity } from '../../../../entities/plants/berry-bush/berry-bush-types';
import { HUMAN_HUNGER_DEATH, HUMAN_INTERACTION_RANGE } from '../../../../human-consts';
import { calculateWrappedDistance } from '../../../../utils/math-utils';
import { TaskResult, TaskType } from '../../task-types';
import { getDistanceScore } from '../../task-utils';
import { defineHumanTask, getStrategyMultiplier } from '../human-task-utils';
import { isWithinOperatingRange } from '../../../../entities/tribe/territory-utils';
import { StrategicObjective } from '../../../../entities/tribe/tribe-types';

export const humanGatherBerriesDefinition = defineHumanTask<HumanEntity>({
  type: TaskType.HumanGatherBerries,
  requireAdult: true,
  scorer: (human, task, context) => {
    if (typeof task.target !== 'number') {
      return null;
    }

    const bush = context.gameState.entities.entities[task.target] as BerryBushEntity | undefined;
    if (!bush || bush.type !== 'berryBush' || bush.food.length === 0) {
      return null;
    }

    // Check operating range
    if (human.leaderId && !isWithinOperatingRange(bush.position, human.leaderId, context.gameState)) {
      return null;
    }

    if (human.food.length >= human.maxFood) {
      return null;
    }

    const distance = calculateWrappedDistance(
      human.position,
      bush.position,
      context.gameState.mapDimensions.width,
      context.gameState.mapDimensions.height,
    );

    // Distance factor: closer is better (0 to 1)
    const distanceFactor = getDistanceScore(distance);

    // Hunger factor: hungrier humans prioritize food gathering more
    const hungerFactor = human.hunger / HUMAN_HUNGER_DEATH;

    // Base score + hunger weight (normalized 0-1)
    const baseScore = (distanceFactor + hungerFactor) / 2;
    return baseScore * getStrategyMultiplier(human, context, StrategicObjective.GreatHarvest, 2.5);
  },
  executor: (task, human, context) => {
    if (typeof task.target !== 'number') {
      return [TaskResult.Failure, 'Invalid target'];
    }

    const bush = context.gameState.entities.entities[task.target] as BerryBushEntity | undefined;
    if (!bush || bush.type !== 'berryBush' || bush.food.length === 0 || human.food.length >= human.maxFood) {
      return [TaskResult.Success, 'Bush is empty']; // Task is "done" if bush is gone or empty
    }

    const distance = calculateWrappedDistance(
      human.position,
      bush.position,
      context.gameState.mapDimensions.width,
      context.gameState.mapDimensions.height,
    );
    if (distance > HUMAN_INTERACTION_RANGE) {
      human.target = bush.position;
      human.activeAction = 'moving';
      return [TaskResult.Running, 'Moving to bush'];
    }

    // At the bush, start gathering
    human.direction = { x: 0, y: 0 };
    human.target = bush.id;
    human.activeAction = 'gathering';

    return [TaskResult.Running, 'Gathering berries'];
  },
});
