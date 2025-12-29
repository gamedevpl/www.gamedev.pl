import { HumanEntity } from '../../../../entities/characters/human/human-types';
import { PreyEntity } from '../../../../entities/characters/prey/prey-types';
import { HUMAN_HUNGER_DEATH, HUMAN_INTERACTION_RANGE } from '../../../../human-consts';
import { calculateWrappedDistance } from '../../../../utils/math-utils';
import { TaskResult, TaskType } from '../../task-types';
import { defineHumanTask, getDistanceScore } from '../../task-utils';
import { TribeRole } from '../../../../entities/tribe/tribe-types';
import { isTribeRole } from '../../../../entities/tribe/tribe-role-utils';
import { AI_HUNTING_MAX_CHASE_DISTANCE_FROM_CENTER } from '../../../../ai-consts';
import { getTribeCenter } from '../../../../utils';
import { isWithinOperatingRange } from '../../../../entities/tribe/territory-utils';

export const humanHuntPreyDefinition = defineHumanTask<HumanEntity>({
  type: TaskType.HumanHuntPrey,
  requireAdult: true,
  autopilotBehavior: 'attack',
  scorer: (human, task, context) => {
    if (typeof task.target !== 'number') return null;

    const prey = context.gameState.entities.entities[task.target] as PreyEntity | undefined;
    if (!prey || prey.type !== 'prey' || prey.hitpoints <= 0) return null;

    // Only hunters should hunt by default unless desperate (handled by high-level AI)
    if (human.leaderId && !isTribeRole(human, TribeRole.Hunter, context.gameState)) {
      return null;
    }

    // Check operating range
    if (human.leaderId && !isWithinOperatingRange(prey.position, human.leaderId, context.gameState)) {
      return null;
    }

    const distance = calculateWrappedDistance(
      human.position,
      prey.position,
      context.gameState.mapDimensions.width,
      context.gameState.mapDimensions.height,
    );

    // Don't chase too far from home
    if (human.leaderId) {
      const tribeCenter = getTribeCenter(human.leaderId, context.gameState);
      const distanceFromCenter = calculateWrappedDistance(
        human.position,
        tribeCenter,
        context.gameState.mapDimensions.width,
        context.gameState.mapDimensions.height,
      );
      if (distanceFromCenter > AI_HUNTING_MAX_CHASE_DISTANCE_FROM_CENTER) return null;
    }

    const distanceFactor = getDistanceScore(distance);
    const hungerFactor = human.hunger / HUMAN_HUNGER_DEATH;

    return (distanceFactor + hungerFactor) / 2;
  },
  executor: (task, human, context) => {
    if (typeof task.target !== 'number') return [TaskResult.Failure, 'Invalid target'];

    const prey = context.gameState.entities.entities[task.target] as PreyEntity | undefined;
    if (!prey || prey.hitpoints <= 0) {
      human.activeAction = 'idle';
      human.attackTargetId = undefined;
      return [TaskResult.Success, 'Prey is dead'];
    }

    const distance = calculateWrappedDistance(
      human.position,
      prey.position,
      context.gameState.mapDimensions.width,
      context.gameState.mapDimensions.height,
    );

    if (distance > HUMAN_INTERACTION_RANGE) {
      human.target = prey.position;
      human.activeAction = 'moving';
      return [TaskResult.Running, 'Chasing prey'];
    }

    human.activeAction = 'attacking';
    human.attackTargetId = prey.id;
    return [TaskResult.Running, 'Hunting prey'];
  },
});
