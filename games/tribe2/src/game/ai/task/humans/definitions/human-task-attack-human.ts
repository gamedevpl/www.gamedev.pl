import { HumanEntity } from '../../../../entities/characters/human/human-types';
import { HUMAN_INTERACTION_RANGE } from '../../../../human-consts';
import { calculateWrappedDistance } from '../../../../utils/math-utils';
import { Task, TaskResult, TaskType } from '../../task-types';
import { defineHumanTask, getDistanceScore } from '../../task-utils';
import { TribeRole } from '../../../../entities/tribe/tribe-types';
import { isTribeRole } from '../../../../entities/tribe/tribe-role-utils';
import { getOwnerOfPoint, isHostile } from '../../../../utils';
import { TASK_DEFAULT_VALIDITY_DURATION } from '../../task-consts';

export const humanAttackHumanDefinition = defineHumanTask<HumanEntity>({
  type: TaskType.HumanAttackHuman,
  requireAdult: true,
  autopilotBehavior: 'attack',
  producer: (human, context) => {
    const { gameState } = context;
    const tasks: Record<string, Task> = {};

    // 1. Trespassing check
    const ownerId = getOwnerOfPoint(human.position.x, human.position.y, gameState);
    const isTrespassing = ownerId !== null && ownerId !== human.leaderId;

    // 2. Aggression check (attacking someone else)
    const isAggressive = human.activeAction === 'attacking' && human.attackTargetId !== undefined;

    if (isTrespassing || isAggressive) {
      const taskId = `attack-human-${human.id}-${gameState.time.toFixed(2)}`;
      tasks[taskId] = {
        id: taskId,
        type: TaskType.HumanAttackHuman,
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

    if (!isTargetHostile && !isTargetTrespassing) {
      return null;
    }

    // Warriors and Hunters prioritize defense/attack
    const isWarrior = isTribeRole(attacker, TribeRole.Warrior, gameState);
    const isHunter = isTribeRole(attacker, TribeRole.Hunter, gameState);

    let baseScore = 0.5;
    if (isWarrior) baseScore = 0.9;
    else if (isHunter) baseScore = 0.7;

    const distance = calculateWrappedDistance(
      attacker.position,
      target.position,
      gameState.mapDimensions.width,
      gameState.mapDimensions.height,
    );

    const distanceFactor = getDistanceScore(distance);

    // If trespassing in our territory, high priority
    if (isTargetTrespassing) {
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
