import { HumanEntity } from '../../../../entities/characters/human/human-types';
import { PredatorEntity } from '../../../../entities/characters/predator/predator-types';
import { HUMAN_INTERACTION_RANGE } from '../../../../human-consts';
import { calculateWrappedDistance } from '../../../../utils/math-utils';
import { TaskResult, TaskType } from '../../task-types';
import { getDistanceScore } from '../../task-utils';
import { defineHumanTask } from '../human-task-utils';
import { isWithinOperatingRange } from '../../../../entities/tribe/territory-utils';

export const humanHuntPredatorDefinition = defineHumanTask<HumanEntity>({
  type: TaskType.HumanHuntPredator,
  requireAdult: true,
  scorer: (human, task, context) => {
    if (typeof task.target !== 'number') return null;

    // Don't start hunting predators if injured
    if (human.hitpoints < human.maxHitpoints * 0.3) {
      return null;
    }

    const predator = context.gameState.entities.entities[task.target] as PredatorEntity | undefined;
    if (!predator || predator.type !== 'predator' || predator.hitpoints <= 0) return null;

    // Predators are threats, so check range
    if (human.leaderId && !isWithinOperatingRange(predator.position, human.leaderId, context.gameState)) {
      return null;
    }

    const distance = calculateWrappedDistance(
      human.position,
      predator.position,
      context.gameState.mapDimensions.width,
      context.gameState.mapDimensions.height,
    );

    const distanceFactor = getDistanceScore(distance);
    // Predators are high priority targets but slightly reduced to balance with survival/gathering
    return (distanceFactor + 0.3) / 1.3;
  },
  executor: (task, human, context) => {
    if (typeof task.target !== 'number') return [TaskResult.Failure, 'Invalid target'];

    // Abandon hunt if health drops too low
    if (human.hitpoints < human.maxHitpoints * 0.2) {
      human.activeAction = 'idle';
      human.attackTargetId = undefined;
      return [TaskResult.Failure, 'Too injured to continue'];
    }

    const predator = context.gameState.entities.entities[task.target] as PredatorEntity | undefined;
    if (!predator || predator.hitpoints <= 0) {
      human.activeAction = 'idle';
      human.attackTargetId = undefined;
      return [TaskResult.Success, 'Predator eliminated'];
    }

    const distance = calculateWrappedDistance(
      human.position,
      predator.position,
      context.gameState.mapDimensions.width,
      context.gameState.mapDimensions.height,
    );

    human.activeAction = 'attacking';
    human.attackTargetId = predator.id;

    if (distance > HUMAN_INTERACTION_RANGE) {
      return [TaskResult.Running, 'Chasing predator'];
    } else {
      return [TaskResult.Running, 'Fighting predator'];
    }
  },
});
