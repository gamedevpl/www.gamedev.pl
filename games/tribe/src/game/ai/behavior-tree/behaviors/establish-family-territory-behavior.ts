import { HumanEntity } from '../../../entities/characters/human/human-types';
import { UpdateContext } from '../../../world-types';
import { BehaviorNode, NodeStatus } from '../behavior-tree-types';
import { ActionNode, ConditionNode, Sequence } from '../nodes';
import { ADULT_MALE_FAMILY_DISTANCE_RADIUS } from '../../../world-consts';
import { findChildren, findParents, getRandomNearbyPosition } from '../../../utils/world-utils';
import { getDirectionVectorOnTorus, vectorNormalize, calculateWrappedDistance } from '../../../utils/math-utils';

/**
 * Creates a behavior for an adult male with a family to move away from his parents
 * to establish his own territory for his family to grow.
 */
export function createEstablishFamilyTerritoryBehavior(depth: number): BehaviorNode {
  const isAdultMaleWithFamily = new ConditionNode(
    (human: HumanEntity, context: UpdateContext) => {
      if (!human.isAdult || human.gender !== 'male') {
        return false;
      }
      const hasPartner = human.partnerIds && human.partnerIds.length > 0;
      const hasChildren = findChildren(context.gameState, human).length > 0;
      return hasPartner || hasChildren;
    },
    'Is Adult Male With Family?',
    depth + 1,
  );

  const isTooCloseToParents = new ConditionNode(
    (human: HumanEntity, context: UpdateContext) => {
      const parents = findParents(human, context.gameState);
      if (parents.length === 0) {
        return false; // No parents to be close to.
      }

      for (const parent of parents) {
        const distance = calculateWrappedDistance(
          human.position,
          parent.position,
          context.gameState.mapDimensions.width,
          context.gameState.mapDimensions.height,
        );
        if (distance < ADULT_MALE_FAMILY_DISTANCE_RADIUS) {
          return true; // Too close to at least one parent.
        }
      }

      return false; // Not too close to any parent.
    },
    'Is Too Close To Parents?',
    depth + 1,
  );

  const findNewTerritoryAndMove = new ActionNode(
    (human: HumanEntity, context: UpdateContext) => {
      // Find a random spot far away to establish a new home.
      const newTerritorySpot = getRandomNearbyPosition(
        human.position,
        context.gameState.mapDimensions.width / 4, // Wander up to a quarter of the map away
        context.gameState.mapDimensions.width,
        context.gameState.mapDimensions.height,
      );

      human.activeAction = 'moving';
      human.target = newTerritorySpot;
      const dirToTarget = getDirectionVectorOnTorus(
        human.position,
        human.target as { x: number; y: number },
        context.gameState.mapDimensions.width,
        context.gameState.mapDimensions.height,
      );
      human.direction = vectorNormalize(dirToTarget);

      // By setting the action to moving, we let the state machine handle the movement.
      // The behavior itself succeeds once it has set the destination.
      return NodeStatus.SUCCESS;
    },
    'Find New Territory & Move',
    depth + 1,
  );

  return new Sequence(
    [isAdultMaleWithFamily, isTooCloseToParents, findNewTerritoryAndMove],
    'Establish Family Territory',
    depth,
  );
}
