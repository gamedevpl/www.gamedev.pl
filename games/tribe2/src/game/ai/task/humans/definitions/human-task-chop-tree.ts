import { HumanEntity } from '../../../../entities/characters/human/human-types';
import { TreeEntity } from '../../../../entities/plants/tree/tree-types';
import { HUMAN_CHOPPING_PROXIMITY } from '../../../../human-consts';
import { calculateWrappedDistance } from '../../../../utils/math-utils';
import { Task, TaskResult, TaskType } from '../../task-types';
import { getDistanceScore } from '../../task-utils';
import { defineHumanTask } from '../human-task-utils';
import { isWithinOperatingRange } from '../../../../entities/tribe/territory-utils';
import { getTribeLeaderForCoordination } from '../../../../entities/tribe/tribe-task-utils';
import { getTribeWoodNeed, getTribeAvailableWoodOnGround } from '../../../../entities/tribe/tribe-food-utils';
import {
  TREE_GROWING,
  TREE_FULL,
  TREE_SPREADING,
  TREE_FALLEN,
} from '../../../../entities/plants/tree/states/tree-state-types';

export const humanChopTreeDefinition = defineHumanTask<HumanEntity>({
  type: TaskType.HumanChopTree,
  requireAdult: true,
  scorer: (human, task, context) => {
    if (typeof task.target !== 'number') {
      return null;
    }

    // Immediate priority if this tree is trapping the human
    if (human.trappedByObstacleId === task.target) {
      return 1000;
    }

    const tree = context.gameState.entities.entities[task.target] as TreeEntity | undefined;
    if (!tree || tree.type !== 'tree') {
      return null;
    }

    const [state] = tree.stateMachine ?? [];
    const isStanding = state === TREE_GROWING || state === TREE_FULL || state === TREE_SPREADING;
    if (!isStanding) {
      return null;
    }

    // Check operating range
    if (human.leaderId && !isWithinOperatingRange(tree.position, human.leaderId, context.gameState)) {
      return null;
    }

    if (human.heldItem || human.food.length === 0) {
      return null;
    }

    // Wood need factor
    const leader = getTribeLeaderForCoordination(human, context.gameState);
    if (!leader) return null;

    const woodNeed = getTribeWoodNeed(leader.id, context.gameState);
    if (woodNeed <= 0) return null;

    const availableOnGround = getTribeAvailableWoodOnGround(leader.id, context.gameState);
    if (availableOnGround >= woodNeed) return null;

    const distance = calculateWrappedDistance(
      human.position,
      tree.position,
      context.gameState.mapDimensions.width,
      context.gameState.mapDimensions.height,
    );

    // Distance factor: closer is better (0 to 1)
    const distanceFactor = getDistanceScore(distance);

    // Need factor: higher need = higher priority.
    const needFactor = Math.min(1, (woodNeed - availableOnGround) / 10);

    return (distanceFactor + needFactor) / 2;
  },
  executor: (task, human, context) => {
    if (typeof task.target !== 'number') {
      return [TaskResult.Failure, 'Invalid target'];
    }

    const tree = context.gameState.entities.entities[task.target] as TreeEntity | undefined;
    if (!tree || tree.type !== 'tree') {
      return [TaskResult.Failure, 'Tree not found'];
    }

    const [state] = tree.stateMachine ?? [];

    // Check if tree has fallen - trigger chain!
    if (state === TREE_FALLEN) {
      const gatherTask: Task = {
        id: `gather-wood-${human.id}-${context.gameState.time}`,
        type: TaskType.HumanGatherWood,
        position: tree.position,
        creatorEntityId: human.id,
        target: tree.id,
        validUntilTime: context.gameState.time + 1,
      };
      return [TaskResult.Success, 'Tree fell!', gatherTask];
    }

    const isStanding = state === TREE_GROWING || state === TREE_FULL || state === TREE_SPREADING;
    if (!isStanding) {
      return [TaskResult.Failure, 'Tree is not standing'];
    }

    if (human.heldItem) {
      return [TaskResult.Failure, 'Hands full'];
    }

    const distance = calculateWrappedDistance(
      human.position,
      tree.position,
      context.gameState.mapDimensions.width,
      context.gameState.mapDimensions.height,
    );

    if (distance > HUMAN_CHOPPING_PROXIMITY) {
      human.target = tree.position;
      human.activeAction = 'moving';
      return [TaskResult.Running, 'Moving to tree'];
    }

    // At the tree, start chopping
    human.direction = { x: 0, y: 0 };
    human.target = tree.id;
    human.activeAction = 'chopping';

    return [TaskResult.Running, 'Chopping tree'];
  },
});
