import {
  CHILD_MAX_WANDER_DISTANCE_FROM_PARENT,
  FEMALE_PARTNER_MAX_WANDER_DISTANCE_FROM_MALE_PARTNER,
  HUMAN_AI_IDLE_WANDER_CHANCE,
  HUMAN_AI_WANDER_RADIUS,
  HUMAN_INTERACTION_PROXIMITY,
  LEADER_FOLLOW_RADIUS,
} from '../../world-consts';
import { HumanEntity } from '../../entities/characters/human/human-types';
import { UpdateContext } from '../../world-types';
import { Goal, GoalType } from '../goals/goal-types';
import { Action, ActionType } from './action-types';
import { findMalePartner, findParents, getRandomNearbyPosition } from '../../utils/world-utils';
import { calculateWrappedDistance, getDirectionVectorOnTorus, vectorNormalize } from '../../utils/math-utils';

export const idleWanderAction: Action = {
  type: ActionType.IDLE_WANDER,

  getUtility(_human: HumanEntity, _context: UpdateContext, goal: Goal): number {
    if (goal.type === GoalType.EXPLORE_AND_WANDER) {
      // Provide a low, constant utility to act as a fallback action.
      return 0.1;
    }
    return 0;
  },

  execute(human: HumanEntity, context: UpdateContext): void {
    const { gameState } = context;

    // If already wandering, check for arrival.
    if (human.activeAction === 'moving' && human.targetPosition) {
      const distanceToTarget = calculateWrappedDistance(
        human.position,
        human.targetPosition,
        gameState.mapDimensions.width,
        gameState.mapDimensions.height,
      );

      if (distanceToTarget < HUMAN_INTERACTION_PROXIMITY) {
        human.activeAction = 'idle';
        human.targetPosition = undefined;
        human.direction = { x: 0, y: 0 };
      }
      // If not yet arrived, continue moving. The state machine handles the movement.
      return;
    }

    // If idle, decide whether to start wandering.
    if (human.activeAction === 'idle' || !human.activeAction) {
      if (Math.random() < HUMAN_AI_IDLE_WANDER_CHANCE) {
        let anchorPoint = human.position;
        let wanderRadius = HUMAN_AI_WANDER_RADIUS;

        const leader =
          human.leaderId && human.leaderId !== human.id
            ? (gameState.entities.entities.get(human.leaderId) as HumanEntity | undefined)
            : undefined;

        if (leader) {
          anchorPoint = leader.position;
          wanderRadius = LEADER_FOLLOW_RADIUS;
        } else if (!human.isAdult) {
          const parents = findParents(human, gameState);
          if (parents.length > 0) {
            anchorPoint = parents[0].position;
            wanderRadius = CHILD_MAX_WANDER_DISTANCE_FROM_PARENT;
          }
        } else if (human.gender === 'female') {
          const malePartner = findMalePartner(human, gameState);
          if (malePartner) {
            anchorPoint = malePartner.position;
            wanderRadius = FEMALE_PARTNER_MAX_WANDER_DISTANCE_FROM_MALE_PARTNER;
          }
        }

        human.activeAction = 'moving';
        human.targetPosition = getRandomNearbyPosition(
          anchorPoint,
          wanderRadius,
          gameState.mapDimensions.width,
          gameState.mapDimensions.height,
        );
        const dirToTarget = getDirectionVectorOnTorus(
          human.position,
          human.targetPosition,
          gameState.mapDimensions.width,
          gameState.mapDimensions.height,
        );
        human.direction = vectorNormalize(dirToTarget);
      } else {
        // Stay idle
        human.activeAction = 'idle';
        human.direction = { x: 0, y: 0 };
        human.targetPosition = undefined;
      }
    }
  },
};
