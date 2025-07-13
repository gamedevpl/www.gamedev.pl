import { HumanEntity } from '../../../entities/characters/human/human-types';
import { UpdateContext } from '../../../world-types';
import { Goal, GoalType } from '../goals/goal-types';
import { Action, ActionType } from './action-types';
import { findBestHabitat, calculateHabitabilityScore } from '../../../utils/world-utils';
import {
  LEADER_MIGRATION_SUPERIORITY_THRESHOLD,
  LEADER_WORLD_ANALYSIS_GRID_SIZE,
  LEADER_WORLD_ANALYSIS_GRID_STEP,
} from '../../../world-consts';
import { IndexedWorldState } from '../../../world-index/world-index-types';

export const migrateAction: Action = {
  type: ActionType.MIGRATE,

  getUtility(human: HumanEntity, context: UpdateContext, goal: Goal): number {
    if (goal.type !== GoalType.EXPLORE_AND_WANDER || human.id !== human.leaderId) {
      return 0;
    }

    const indexedState = context.gameState as IndexedWorldState;

    const { score: currentHabitatScore } = calculateHabitabilityScore(
      human.position,
      LEADER_WORLD_ANALYSIS_GRID_SIZE / 2,
      indexedState,
      human.id,
    );

    const bestHabitat = findBestHabitat(indexedState, human.id, LEADER_WORLD_ANALYSIS_GRID_STEP);

    if (bestHabitat && bestHabitat.score > currentHabitatScore * LEADER_MIGRATION_SUPERIORITY_THRESHOLD) {
      // High utility if a significantly better place to live exists.
      return 0.8;
    }

    return 0;
  },

  execute(human: HumanEntity, context: UpdateContext): void {
    const indexedState = context.gameState as IndexedWorldState;
    const bestHabitat = findBestHabitat(indexedState, human.id, LEADER_WORLD_ANALYSIS_GRID_STEP);

    if (bestHabitat) {
      human.activeAction = 'moving';
      human.targetPosition = bestHabitat.position;
    }
  },
};
