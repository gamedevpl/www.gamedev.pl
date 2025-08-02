import { HumanEntity } from '../../../entities/characters/human/human-types';
import { UpdateContext } from '../../../world-types';
import { BehaviorNode, NodeStatus } from '../behavior-tree-types';
import { ActionNode, ConditionNode, CooldownNode, Selector, Sequence } from '../nodes';
import {
  ADULT_MALE_FAMILY_DISTANCE_RADIUS,
  BT_ESTABLISH_TERRITORY_COOLDOWN_HOURS,
  ESTABLISH_TERRITORY_MOVEMENT_TIMEOUT_HOURS
} from '../../../ai-consts.ts';
import {
  HUMAN_INTERACTION_PROXIMITY
} from '../../../human-consts.ts';
import { findChildren, findHeir, getRandomNearbyPosition, findPlayerEntity } from '../../../utils';
import { calculateWrappedDistance, getDirectionVectorOnTorus, vectorNormalize } from '../../../utils/math-utils';
import { Blackboard } from '../behavior-tree-blackboard';
import { Vector2D } from '../../../utils/math-types';

/**
 * Creates a behavior for an adult male with a family to move away from his parents
 * to establish his own territory for his family to grow.
 */
export function createEstablishFamilyTerritoryBehavior(depth: number): BehaviorNode<HumanEntity> {
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
      // The player's heir should not try to establish a new territory.
      const player = findPlayerEntity(context.gameState);
      if (player) {
        const playerHeir = findHeir(findChildren(context.gameState, player));
        if (playerHeir?.id === human.id) {
          return false;
        }
      }

      if (!human.fatherId) {
        return false;
      }

      const father = context.gameState.entities.entities.get(human.fatherId) as HumanEntity | undefined;
      if (!father) {
        return false; // No parents to be close to.
      }

      if (findHeir(findChildren(context.gameState, father))?.id === human.id) {
        return false;
      }

      const distance = calculateWrappedDistance(
        human.position,
        father.position,
        context.gameState.mapDimensions.width,
        context.gameState.mapDimensions.height,
      );
      if (distance < ADULT_MALE_FAMILY_DISTANCE_RADIUS) {
        return true; // Too close to at least one parent.
      }

      return false; // Not too close to any parent.
    },
    'Is Too Close To Father?',
    depth + 1,
  );

  // --- Decomposed Nodes ---\\n\\n  // Node to check if a move is already in progress
  const isMovingToTerritory = new ConditionNode(
    (_human: HumanEntity, _context: UpdateContext, blackboard: Blackboard) => {
      return blackboard.get('territoryMoveTarget') !== undefined;
    },
    'Is Moving To Territory?',
    depth + 3,
  );

  // Node to handle timeout and arrival checks for an in-progress move
  const checkTimeoutAndArrival = new ActionNode(
    (human: HumanEntity, context: UpdateContext, blackboard: Blackboard) => {
      const moveTarget = blackboard.get<Vector2D>('territoryMoveTarget');
      const moveStartTime = blackboard.get<number>('territoryMoveStartTime');

      // This node should only run if target and time exist, but we check to be safe
      if (!moveTarget || !moveStartTime) {
        return [NodeStatus.FAILURE, 'Missing move data'];
      }

      // Condition 1: Check for timeout
      const elapsed = context.gameState.time - moveStartTime;
      if (elapsed > ESTABLISH_TERRITORY_MOVEMENT_TIMEOUT_HOURS) {
        blackboard.delete('territoryMoveTarget');
        blackboard.delete('territoryMoveStartTime');
        return [NodeStatus.FAILURE, 'Territory move timed out'];
      }

      // Condition 2: Check for arrival
      const distanceToTarget = calculateWrappedDistance(
        human.position,
        moveTarget,
        context.gameState.mapDimensions.width,
        context.gameState.mapDimensions.height,
      );

      if (distanceToTarget < HUMAN_INTERACTION_PROXIMITY) {
        blackboard.delete('territoryMoveTarget');
        blackboard.delete('territoryMoveStartTime');
        return [NodeStatus.SUCCESS, 'Arrived at new territory'];
      }

      // Still moving, ensure state is correct as another behavior might have interrupted
      human.activeAction = 'moving';
      human.target = moveTarget;
      const dirToTarget = getDirectionVectorOnTorus(
        human.position,
        human.target as Vector2D,
        context.gameState.mapDimensions.width,
        context.gameState.mapDimensions.height,
      );
      human.direction = vectorNormalize(dirToTarget);

      return [NodeStatus.RUNNING, 'Continuing move to territory'];
    },
    'Check Timeout & Arrival',
    depth + 3,
  );

  // Sequence to handle an in-progress move
  const handleInProgressMove = new Sequence(
    [isMovingToTerritory, checkTimeoutAndArrival],
    'Handle In-Progress Move',
    depth + 2,
  );

  // Condition to check if we should start a new move
  const shouldStartNewMove = new ConditionNode(
    (_human: HumanEntity, _context: UpdateContext, blackboard: Blackboard) => {
      return blackboard.get('territoryMoveTarget') === undefined;
    },
    'Should Start New Move?',
    depth + 4,
  );

  // Node to start a new move
  const startNewTerritoryMove = new ActionNode(
    (human: HumanEntity, context: UpdateContext, blackboard: Blackboard) => {
      // Start a new move action
      const newTerritorySpot = getRandomNearbyPosition(
        human.position,
        context.gameState.mapDimensions.width / 4, // Wander up to a quarter of the map away
        context.gameState.mapDimensions.width,
        context.gameState.mapDimensions.height,
      );

      blackboard.set('territoryMoveTarget', newTerritorySpot);
      blackboard.set('territoryMoveStartTime', context.gameState.time);

      human.activeAction = 'moving';
      human.target = newTerritorySpot;
      const dirToTarget = getDirectionVectorOnTorus(
        human.position,
        human.target as Vector2D,
        context.gameState.mapDimensions.width,
        context.gameState.mapDimensions.height,
      );
      human.direction = vectorNormalize(dirToTarget);

      return [NodeStatus.RUNNING, 'Started moving to new territory'];
    },
    'Start New Territory Move',
    depth + 4,
  );

  // Sequence to wrap the start move logic
  const startNewTerritoryMoveSequence = new Sequence(
    [shouldStartNewMove, startNewTerritoryMove],
    'Start New Territory Move Action',
    depth + 3,
  );

  // Selector to either handle the in-progress move or start a new one
  const establishOrContinueMove = new Selector(
    [
      handleInProgressMove,
      new CooldownNode(
        BT_ESTABLISH_TERRITORY_COOLDOWN_HOURS,
        startNewTerritoryMoveSequence,
        'Establish Territory Cooldown',
        depth + 2,
      ),
    ],
    'Establish or Continue Move',
    depth + 1,
  );

  return new Sequence(
    [isAdultMaleWithFamily, isTooCloseToParents, establishOrContinueMove],
    'Establish Family Territory',
    depth,
  );
}
