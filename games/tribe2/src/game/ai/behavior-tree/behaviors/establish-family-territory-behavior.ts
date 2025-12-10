import { HumanEntity } from '../../../entities/characters/human/human-types';
import { UpdateContext } from '../../../world-types';
import { BehaviorNode, NodeStatus } from '../behavior-tree-types';
import { ActionNode, ConditionNode, CooldownNode, Sequence } from '../nodes';
import {
  ADULT_MALE_FAMILY_DISTANCE_RADIUS,
  BT_ESTABLISH_TERRITORY_COOLDOWN_HOURS,
  ESTABLISH_TERRITORY_MOVEMENT_TIMEOUT_HOURS,
} from '../../../ai-consts.ts';
import { HUMAN_INTERACTION_PROXIMITY } from '../../../human-consts.ts';
import { findChildren, findHeir, getRandomNearbyPosition, findPlayerEntity } from '../../../utils';
import { calculateWrappedDistance, getDirectionVectorOnTorus, vectorNormalize } from '../../../utils/math-utils';
import { Blackboard, BlackboardData } from '../behavior-tree-blackboard';
import { Vector2D } from '../../../utils/math-types';

const TERRITORY_TARGET_KEY = 'territoryMoveTarget';
const TERRITORY_START_TIME_KEY = 'territoryMoveStartTime';

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

  // Condition: Should attempt to establish territory?
  // Returns true if:
  // 1. A territory move is already in progress (to allow continuation), OR
  // 2. Human is too close to their father and should start a new move
  const shouldEstablishTerritory = new ConditionNode(
    (human: HumanEntity, context: UpdateContext, blackboard: BlackboardData) => {
      // If a territory move is already in progress, allow it to continue.
      // This prevents the sequence from aborting mid-move when the human
      // has already moved far enough from their father.
      if (Blackboard.get(blackboard, TERRITORY_TARGET_KEY) !== undefined) {
        return [true, 'Territory move in progress'];
      }

      // The player's heir should not try to establish a new territory.
      const player = findPlayerEntity(context.gameState);
      if (player) {
        const playerHeir = findHeir(findChildren(context.gameState, player));
        if (playerHeir?.id === human.id) {
          return [false, 'Is player heir'];
        }
      }

      if (!human.fatherId) {
        return [false, 'No father'];
      }

      const father = context.gameState.entities.entities[human.fatherId] as HumanEntity | undefined;
      if (!father) {
        return [false, 'Father not found']; // No parents to be close to.
      }

      if (findHeir(findChildren(context.gameState, father))?.id === human.id) {
        return [false, 'Is father heir'];
      }

      const distance = calculateWrappedDistance(
        human.position,
        father.position,
        context.gameState.mapDimensions.width,
        context.gameState.mapDimensions.height,
      );
      if (distance < ADULT_MALE_FAMILY_DISTANCE_RADIUS) {
        return [true, `Too close to father: ${distance.toFixed(0)}`]; // Too close to at least one parent.
      }

      return [false, `Far enough from father: ${distance.toFixed(0)}`]; // Not too close to any parent.
    },
    'Should Establish Territory?',
    depth + 1,
  );

  // Combined action node that handles both starting and continuing the move
  // (similar pattern to tribe-split-behavior.ts)
  const moveToNewTerritory = new ActionNode(
    (human: HumanEntity, context: UpdateContext, blackboard: BlackboardData) => {
      let moveTarget = Blackboard.get<Vector2D>(blackboard, TERRITORY_TARGET_KEY);
      let moveStartTime = Blackboard.get<number>(blackboard, TERRITORY_START_TIME_KEY);

      // Step 1: If no target exists, create one (starting a new move)
      if (!moveTarget) {
        const newTerritorySpot = getRandomNearbyPosition(
          human.position,
          context.gameState.mapDimensions.width / 4, // Wander up to a quarter of the map away
          context.gameState.mapDimensions.width,
          context.gameState.mapDimensions.height,
        );

        Blackboard.set(blackboard, TERRITORY_TARGET_KEY, newTerritorySpot);
        Blackboard.set(blackboard, TERRITORY_START_TIME_KEY, context.gameState.time);
        moveTarget = newTerritorySpot;
        moveStartTime = context.gameState.time;
      }

      // At this point, both moveTarget and moveStartTime are guaranteed to be defined
      // (either from blackboard or just set above)
      const target = moveTarget;
      const startTime = moveStartTime!;

      // Step 2: Check for timeout
      const elapsed = context.gameState.time - startTime;
      if (elapsed > ESTABLISH_TERRITORY_MOVEMENT_TIMEOUT_HOURS) {
        Blackboard.delete(blackboard, TERRITORY_TARGET_KEY);
        Blackboard.delete(blackboard, TERRITORY_START_TIME_KEY);
        return [NodeStatus.FAILURE, 'Territory move timed out'];
      }

      // Step 3: Check for arrival
      const distanceToTarget = calculateWrappedDistance(
        human.position,
        target,
        context.gameState.mapDimensions.width,
        context.gameState.mapDimensions.height,
      );

      if (distanceToTarget < HUMAN_INTERACTION_PROXIMITY) {
        Blackboard.delete(blackboard, TERRITORY_TARGET_KEY);
        Blackboard.delete(blackboard, TERRITORY_START_TIME_KEY);
        return [NodeStatus.SUCCESS, 'Arrived at new territory'];
      }

      // Step 4: Continue moving
      human.activeAction = 'moving';
      human.target = target;
      const dirToTarget = getDirectionVectorOnTorus(
        human.position,
        target,
        context.gameState.mapDimensions.width,
        context.gameState.mapDimensions.height,
      );
      human.direction = vectorNormalize(dirToTarget);

      return [NodeStatus.RUNNING, 'Moving to new territory'];
    },
    'Move To New Territory',
    depth + 2,
  );

  // The full behavior sequence:
  // 1. Check if adult male with family
  // 2. Check if should establish territory (too close to father OR move in progress)
  // 3. Move to new territory (handles both starting and continuing)
  const establishTerritorySequence = new Sequence(
    [isAdultMaleWithFamily, shouldEstablishTerritory, moveToNewTerritory],
    'Establish Family Territory',
    depth,
  );

  // Wrap in cooldown to prevent constant re-checking
  // Note: The cooldown only triggers when the sequence SUCCEEDS (arrives at destination)
  return new CooldownNode(
    BT_ESTABLISH_TERRITORY_COOLDOWN_HOURS,
    establishTerritorySequence,
    'Establish Territory Cooldown',
    depth,
  );
}
