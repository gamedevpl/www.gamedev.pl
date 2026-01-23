import { HumanEntity } from '../../../../entities/characters/human/human-types';
import { TreeEntity } from '../../../../entities/plants/tree/tree-types';
import { HUMAN_INTERACTION_RANGE } from '../../../../human-consts';
import { calculateWrappedDistance } from '../../../../utils/math-utils';
import { TaskResult, TaskType } from '../../task-types';
import { getDistanceScore } from '../../task-utils';
import { defineHumanTask, getStrategyMultiplier } from '../human-task-utils';
import { isWithinOperatingRange } from '../../../../entities/tribe/territory-utils';
import { getTribeLeaderForCoordination } from '../../../../entities/tribe/tribe-task-utils';
import { getTribeWoodNeed } from '../../../../entities/tribe/tribe-food-utils';
import { StrategicObjective } from '../../../../entities/tribe/tribe-types';
import { TREE_FALLEN } from '../../../../entities/plants/tree/states/tree-state-types';

export const humanGatherWoodDefinition = defineHumanTask<HumanEntity>({
  type: TaskType.HumanGatherWood,
  requireAdult: true,
  scorer: (human, task, context) => {
    if (typeof task.target !== 'number') {
      return null;
    }

    const tree = context.gameState.entities.entities[task.target] as TreeEntity | undefined;
    if (!tree || tree.type !== 'tree' || tree.wood.length === 0) {
      return null;
    }

    const [state] = tree.stateMachine ?? [];
    if (state !== TREE_FALLEN) {
      return null;
    }

    // Check operating range
    if (human.leaderId && !isWithinOperatingRange(tree.position, human.leaderId, context.gameState)) {
      return null;
    }

    if (human.heldItem) {
      return null;
    }

    const distance = calculateWrappedDistance(
      human.position,
      tree.position,
      context.gameState.mapDimensions.width,
      context.gameState.mapDimensions.height,
    );

    // Distance factor: closer is better (0 to 1)
    const distanceFactor = getDistanceScore(distance);

    // Wood need factor
    const leader = getTribeLeaderForCoordination(human, context.gameState);
    const woodNeed = leader ? getTribeWoodNeed(leader.id, context.gameState) : 0;
    const needFactor = Math.min(1, woodNeed / 10);

    const baseScore = (distanceFactor + needFactor) / 2;
    return baseScore * getStrategyMultiplier(human, context, StrategicObjective.LumberjackFever, 3.0);
  },
  executor: (task, human, context) => {
    if (typeof task.target !== 'number') {
      return [TaskResult.Failure, 'Invalid target'];
    }

    if (human.heldItem?.type === 'wood') {
      return [TaskResult.Success, 'Already holding wood'];
    }

    const tree = context.gameState.entities.entities[task.target] as TreeEntity | undefined;
    if (!tree || tree.type !== 'tree' || tree.wood.length === 0 || human.heldItem) {
      return [TaskResult.Failure, 'Tree gone, empty, or human full'];
    }

    const distance = calculateWrappedDistance(
      human.position,
      tree.position,
      context.gameState.mapDimensions.width,
      context.gameState.mapDimensions.height,
    );
    if (distance > HUMAN_INTERACTION_RANGE) {
      human.target = tree.position;
      human.activeAction = 'moving';
      return [TaskResult.Running, 'Moving to wood'];
    }

    // At the tree, start gathering
    human.direction = { x: 0, y: 0 };
    human.target = tree.id;
    human.activeAction = 'gathering';

    return [TaskResult.Running, 'Gathering wood'];
  },
});
