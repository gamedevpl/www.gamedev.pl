import { HumanEntity } from '../../entities/characters/human/human-types';
import { UpdateContext } from '../../world-types';
import { Action } from './actions/action-types';
import { attackHumanAction } from './actions/attack-human-action';
import { callToAttackAction } from './actions/call-to-attack-action';
import { eatAction } from './actions/eat-action';
import { feedChildAction } from './actions/feed-child-action';
import { fleeAction } from './actions/flee-action';
import { gatherFoodAction } from './actions/gather-food-action';
import { gatherFoodForChildAction } from './actions/gather-food-for-child-action';
import { idleWanderAction } from './actions/idle-wander-action';
import { migrateAction } from './actions/migrate-action';
import { plantBushAction } from './actions/plant-bush-action';
import { procreateAction } from './actions/procreate-action';
import { seekFoodFromParentAction } from './actions/seek-food-from-parent-action';
import { defendSelfGoal } from './goals/defend-self-goal';
import { defendTribeGoal } from './goals/defend-tribe-goal';
import { eliminateThreatsGoal } from './goals/eliminate-threats-goal';
import { exploreAndWanderGoal } from './goals/explore-and-wander-goal';
import { feedChildrenGoal } from './goals/feed-children-goal';
import { gatherFoodGoal } from './goals/gather-food-goal';
import { Goal } from './goals/goal-types';
import { maintainHealthGoal } from './goals/maintain-health-goal';
import { plantBushesGoal } from './goals/plant-bushes-goal';
import { procreateGoal } from './goals/procreate-goal';
import { satisfyHungerGoal } from './goals/satisfy-hunger-goal';

// Lists of all available goals and actions for the Utility AI
const availableGoals: Goal[] = [
  satisfyHungerGoal,
  maintainHealthGoal,
  gatherFoodGoal,
  plantBushesGoal,
  procreateGoal,
  feedChildrenGoal,
  defendSelfGoal,
  defendTribeGoal,
  eliminateThreatsGoal,
  exploreAndWanderGoal,
];

const availableActions: Action[] = [
  eatAction,
  gatherFoodAction,
  plantBushAction,
  fleeAction,
  attackHumanAction,
  procreateAction,
  feedChildAction,
  seekFoodFromParentAction,
  gatherFoodForChildAction,
  callToAttackAction,
  migrateAction,
  idleWanderAction,
];

/**
 * Updates the AI for a human entity using a utility-based system.
 * This function evaluates all possible actions against all goals
 * to determine the best action to take.
 *
 * @param human The human entity to update.
 * @param context The current game update context.
 */
export function updateUtilityAI(human: HumanEntity, context: UpdateContext): void {
  if (availableActions.length === 0 || availableGoals.length === 0) {
    // Fallback to idle if no actions or goals are defined
    human.activeAction = 'idle';
    return;
  }

  let bestAction: Action | null = null;
  let highestUtility = -Infinity;

  // 1. Evaluate all actions
  for (const action of availableActions) {
    let totalUtility = 0;

    // 2. For each action, calculate its utility against all goals
    for (const goal of availableGoals) {
      const goalScore = goal.getScore(human, context);
      if (goalScore <= 0) continue; // Skip goals that are not currently relevant

      const actionUtilityForGoal = action.getUtility(human, context, goal);
      totalUtility += goalScore * actionUtilityForGoal;
    }

    // 3. Keep track of the action with the highest total utility
    if (totalUtility > highestUtility) {
      highestUtility = totalUtility;
      bestAction = action;
    }
  }

  // 4. Execute the best action found
  if (bestAction && highestUtility > 0) {
    bestAction.execute(human, context);
  } else {
    // If no action has a positive utility, default to idle.
    // This can be expanded later with a dedicated IdleWanderAction.
    human.activeAction = 'idle';
    human.direction = { x: 0, y: 0 };
    human.targetPosition = undefined;
  }
}
