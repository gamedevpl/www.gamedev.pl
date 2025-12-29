import { HumanEntity } from '../../../../entities/characters/human/human-types';
import { PredatorEntity } from '../../../../entities/characters/predator/predator-types';
import { HUMAN_INTERACTION_RANGE } from '../../../../human-consts';
import { calculateWrappedDistance } from '../../../../utils/math-utils';
import { TaskResult, TaskType } from '../../task-types';
import { defineHumanTask, getDistanceScore } from '../../task-utils';
import { TribeRole } from '../../../../entities/tribe/tribe-types';
import { isTribeRole } from '../../../../entities/tribe/tribe-role-utils';
import { isWithinOperatingRange } from '../../../../entities/tribe/territory-utils';

export const humanHuntPredatorDefinition = defineHumanTask<HumanEntity>({
  type: TaskType.HumanHuntPredator,
  requireAdult: true,
  autopilotBehavior: 'attack',
  scorer: (human, task, context) => {
    if (typeof task.target !== 'number') return null;

    const predator = context.gameState.entities.entities[task.target] as PredatorEntity | undefined;
    if (!predator || predator.type !== 'predator' || predator.hitpoints <= 0) return null;

    // Warriors and Hunters prioritize predators
    const isWarrior = human.leaderId && isTribeRole(human, TribeRole.Warrior, context.gameState);
    const isHunter = human.leaderId && isTribeRole(human, TribeRole.Hunter, context.gameState);
    
    if (human.leaderId && !isWarrior && !isHunter) return null;

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
    // Predators are high priority targets regardless of hunger
    return (distanceFactor + 1) / 2; 
  },
  executor: (task, human, context) => {
    if (typeof task.target !== 'number') return [TaskResult.Failure, 'Invalid target'];

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

    if (distance > HUMAN_INTERACTION_RANGE) {
      human.target = predator.position;
      human.activeAction = 'moving';
      return [TaskResult.Running, 'Chasing predator'];
    }

    human.activeAction = 'attacking';
    human.attackTargetId = predator.id;
    return [TaskResult.Running, 'Fighting predator'];
  },
});
