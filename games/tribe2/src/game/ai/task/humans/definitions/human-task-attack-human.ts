import { HumanEntity } from '../../../../entities/characters/human/human-types';
import { HUMAN_INTERACTION_RANGE } from '../../../../human-consts';
import { calculateWrappedDistance } from '../../../../utils/math-utils';
import { Task, TaskResult, TaskType } from '../../task-types';
import { getDistanceScore } from '../../task-utils';
import { defineHumanTask } from '../human-task-utils';
import { getOwnerOfPoint, isHostile, isTribeHostile } from '../../../../utils';
import { TASK_DEFAULT_VALIDITY_DURATION } from '../../task-consts';

export const humanAttackHumanDefinition = defineHumanTask<HumanEntity>({
  type: TaskType.HumanAttackHuman,
  requireAdult: true,
  producer: (human, context) => {
    const { gameState } = context;
    const tasks: Record<string, Task> = {};

    // 1. Trespassing check - only care if the owner is hostile
    const ownerId = getOwnerOfPoint(human.position.x, human.position.y, gameState);
    const isTrespassing =
      ownerId !== null && ownerId !== human.leaderId && isTribeHostile(human.leaderId, ownerId, gameState);

    // 2. Aggression check (attacking someone else)
    const isAggressive = human.activeAction === 'attacking' && human.attackTargetId !== undefined;

    if (isTrespassing || isAggressive) {
      const taskId = `attack-human-${human.id}`;
      tasks[taskId] = {
        id: taskId,
        type: TaskType.HumanAttackHuman,
        position: human.position,
        creatorEntityId: human.id,
        target: human.id,
        validUntilTime: gameState.time + TASK_DEFAULT_VALIDITY_DURATION,
      };
    }

    return tasks;
  },
  scorer: (attacker, task, context) => {
    if (typeof task.target !== 'number') return null;

    const target = context.gameState.entities.entities[task.target] as HumanEntity | undefined;
    if (!target || target.type !== 'human' || target.hitpoints <= 0) return null;

    // Don't attack yourself or tribe members
    if (target.id === attacker.id || target.leaderId === attacker.leaderId) return null;

    const { gameState } = context;

    // Check if we have a reason to attack
    const isTargetHostile = isHostile(attacker, target, gameState);
    const isTargetTrespassing = getOwnerOfPoint(target.position.x, target.position.y, gameState) === attacker.leaderId;
    const isTargetAggressive = target.activeAction === 'attacking' && target.attackTargetId !== undefined;

    // Only attack if hostile or aggressive. Peaceful trespassers from non-hostile tribes are ignored.
    if (!isTargetHostile && !isTargetAggressive) {
      return null;
    }

    let baseScore = 0.5;

    const distance = calculateWrappedDistance(
      attacker.position,
      target.position,
      gameState.mapDimensions.width,
      gameState.mapDimensions.height,
    );

    const distanceFactor = getDistanceScore(distance);

    // If trespassing in our territory AND hostile, high priority
    if (isTargetTrespassing && isTargetHostile) {
      baseScore += 0.1;
    }

    return (distanceFactor + baseScore) / 2;
  },
  executor: (task, human, context) => {
    if (typeof task.target !== 'number') return [TaskResult.Failure, 'Invalid target'];

    const target = context.gameState.entities.entities[task.target] as HumanEntity | undefined;
    if (!target || target.hitpoints <= 0) {
      human.activeAction = 'idle';
      human.attackTargetId = undefined;
      return [TaskResult.Success, 'Target eliminated'];
    }

    const distance = calculateWrappedDistance(
      human.position,
      target.position,
      context.gameState.mapDimensions.width,
      context.gameState.mapDimensions.height,
    );

    human.activeAction = 'attacking';
    human.attackTargetId = target.id;

    if (distance > HUMAN_INTERACTION_RANGE) {
      return [TaskResult.Running, 'Chasing human target'];
    } else {
      return [TaskResult.Running, 'Fighting human target'];
    }
  },
});
