import { HumanEntity } from '../../entities/characters/human/human-types';
import { UpdateContext } from '../../world-types';
import { vectorNormalize, getDirectionVectorOnTorus, calculateWrappedDistance } from '../../utils/math-utils';
import {
  findMalePartner,
  findParents,
  getRandomNearbyPosition,
  findClosestEntity,
  isPositionInTerritory,
} from '../../utils/world-utils';
import {
  CHILD_MAX_WANDER_DISTANCE_FROM_PARENT,
  FEMALE_PARTNER_MAX_WANDER_DISTANCE_FROM_MALE_PARTNER,
  HUMAN_AI_IDLE_WANDER_CHANCE,
  HUMAN_AI_WANDER_RADIUS,
  HUMAN_INTERACTION_RANGE,
  LEADER_FOLLOW_RADIUS,
} from '../../world-consts';
import { HumanAIStrategy } from './ai-strategy-types';
import { FlagEntity } from '../../entities/flag/flag-types';

export class IdleWanderStrategy implements HumanAIStrategy<boolean> {
  check(): boolean {
    // This strategy is a fallback, so it always applies if no other strategy has taken precedence.
    return true;
  }

  execute(human: HumanEntity, context: UpdateContext): void {
    const { gameState } = context;

    // If idle, maybe start wandering
    if (human.activeAction === 'idle' || !human.activeAction) {
      human.activeAction = 'idle'; // Ensure activeAction is set

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
            anchorPoint = parents[0].position; // Wander around the first available parent
            wanderRadius = CHILD_MAX_WANDER_DISTANCE_FROM_PARENT;
          }
        } else if (human.gender === 'female') {
          const malePartner = findMalePartner(human, gameState);
          if (malePartner) {
            anchorPoint = malePartner.position;
            wanderRadius = FEMALE_PARTNER_MAX_WANDER_DISTANCE_FROM_MALE_PARTNER;
          }
        }

        // If part of a tribe, prefer to wander within own territory
        if (human.leaderId) {
          const closestOwnFlag = findClosestEntity<FlagEntity>(
            human,
            gameState,
            'flag',
            undefined,
            (f) => f.leaderId === human.leaderId,
          );
          if (closestOwnFlag) {
            // If outside our territory, have a high chance to wander back towards it
            if (
              !isPositionInTerritory(human.position, closestOwnFlag.position, closestOwnFlag.territoryRadius, gameState)
            ) {
              if (Math.random() < 0.8) {
                anchorPoint = closestOwnFlag.position;
                wanderRadius = closestOwnFlag.territoryRadius;
              }
            } else {
              // If already inside, wander around the flag
              anchorPoint = closestOwnFlag.position;
              wanderRadius = closestOwnFlag.territoryRadius;
            }
          }
        }

        // Start wandering
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
        human.direction = { x: 0, y: 0 };
        human.targetPosition = undefined;
      }
      return;
    }

    // If wandering (moving without a specific gathering/eating purpose)
    if (human.activeAction === 'moving' && human.targetPosition) {
      const distanceToTarget = calculateWrappedDistance(
        human.position,
        human.targetPosition,
        context.gameState.mapDimensions.width,
        context.gameState.mapDimensions.height,
      );

      // Arrived at wander destination
      if (distanceToTarget < HUMAN_INTERACTION_RANGE) {
        human.activeAction = 'idle';
        human.targetPosition = undefined;
        human.direction = { x: 0, y: 0 };
      }
      return; // Continue wandering or just switched to idle
    }

    // Fallback: If somehow reached here with an undefined state, or an action not handled above
    if (human.activeAction !== 'moving') {
      human.activeAction = 'idle';
      human.direction = { x: 0, y: 0 };
      human.targetPosition = undefined;
    }
  }
}
