import { HumanEntity } from '../../../entities/characters/human/human-types';
import { UpdateContext } from '../../../world-types';
import {
  canSplitTribe,
  performTribeSplit,
  createSplitState,
  areFamilyMembersGathered,
  coordinateFamilyMovement,
  transferBuildingOwnership,
} from '../../../utils';
import { BehaviorNode, NodeStatus } from '../behavior-tree-types';
import { ActionNode, ConditionNode, CooldownNode, Selector, Sequence } from '../nodes';
import {
  TRIBE_SPLIT_CHECK_INTERVAL_HOURS,
  TRIBE_SPLIT_GATHERING_TIMEOUT_HOURS,
  TRIBE_SPLIT_GATHERING_ARRIVAL_DISTANCE,
} from '../../../entities/tribe/tribe-consts.ts';
import { TribeSplitPhase, TribeSplitStrategy, TribeSplitState } from '../../../entities/tribe/tribe-types.ts';
import { calculateWrappedDistance } from '../../../utils/math-utils.ts';
import { Blackboard, BlackboardData } from '../behavior-tree-blackboard.ts';
import { EntityId } from '../../../entities/entities-types.ts';
import { getTribeLeaderForCoordination } from '../../../entities/tribe/tribe-task-utils.ts';
import { GameWorldState } from '../../../world-types.ts';

// Blackboard keys for the tribe split state (stored on tribe leader's blackboard)
// Key format: tribeSplit_{patriarchId}_{field}
function getSplitStateKey(patriarchId: EntityId, field: string): string {
  return `tribeSplit_${patriarchId}_${field}`;
}

/**
 * Helper to get split state from leader's blackboard for a specific patriarch
 */
function getSplitStateFromLeaderBlackboard(
  leaderBlackboard: BlackboardData,
  patriarchId: EntityId,
): TribeSplitState | null {
  const strategy = Blackboard.get<string>(leaderBlackboard, getSplitStateKey(patriarchId, 'strategy'));
  const phase = Blackboard.get<string>(leaderBlackboard, getSplitStateKey(patriarchId, 'phase'));
  const targetX = Blackboard.get<number>(leaderBlackboard, getSplitStateKey(patriarchId, 'targetX'));
  const targetY = Blackboard.get<number>(leaderBlackboard, getSplitStateKey(patriarchId, 'targetY'));
  const startTime = Blackboard.get<number>(leaderBlackboard, getSplitStateKey(patriarchId, 'startTime'));
  const familyIds = Blackboard.get<string>(leaderBlackboard, getSplitStateKey(patriarchId, 'familyIds'));

  if (
    strategy === undefined ||
    phase === undefined ||
    targetX === undefined ||
    targetY === undefined ||
    startTime === undefined ||
    familyIds === undefined
  ) {
    return null;
  }

  const targetBuildingId = Blackboard.get<number>(leaderBlackboard, getSplitStateKey(patriarchId, 'buildingId'));

  // Parse family IDs from comma-separated string
  const familyMemberIds = familyIds.split(',').map((id) => parseInt(id, 10)).filter((id) => !isNaN(id));

  return {
    strategy: strategy as TribeSplitStrategy,
    phase: phase as TribeSplitPhase,
    gatheringTarget: { x: targetX, y: targetY },
    startTime,
    familyMemberIds,
    targetBuildingId,
  };
}

/**
 * Helper to save split state to leader's blackboard for a specific patriarch
 */
function saveSplitStateToLeaderBlackboard(
  leaderBlackboard: BlackboardData,
  patriarchId: EntityId,
  state: TribeSplitState,
): void {
  Blackboard.set(leaderBlackboard, getSplitStateKey(patriarchId, 'strategy'), state.strategy);
  Blackboard.set(leaderBlackboard, getSplitStateKey(patriarchId, 'phase'), state.phase);
  Blackboard.set(leaderBlackboard, getSplitStateKey(patriarchId, 'targetX'), state.gatheringTarget.x);
  Blackboard.set(leaderBlackboard, getSplitStateKey(patriarchId, 'targetY'), state.gatheringTarget.y);
  Blackboard.set(leaderBlackboard, getSplitStateKey(patriarchId, 'startTime'), state.startTime);
  // Store family IDs as comma-separated string (blackboard supports strings)
  Blackboard.set(leaderBlackboard, getSplitStateKey(patriarchId, 'familyIds'), state.familyMemberIds.join(','));
  if (state.targetBuildingId !== undefined) {
    Blackboard.set(leaderBlackboard, getSplitStateKey(patriarchId, 'buildingId'), state.targetBuildingId);
  }
}

/**
 * Helper to clear split state from leader's blackboard for a specific patriarch
 */
function clearSplitStateFromLeaderBlackboard(leaderBlackboard: BlackboardData, patriarchId: EntityId): void {
  Blackboard.delete(leaderBlackboard, getSplitStateKey(patriarchId, 'strategy'));
  Blackboard.delete(leaderBlackboard, getSplitStateKey(patriarchId, 'phase'));
  Blackboard.delete(leaderBlackboard, getSplitStateKey(patriarchId, 'targetX'));
  Blackboard.delete(leaderBlackboard, getSplitStateKey(patriarchId, 'targetY'));
  Blackboard.delete(leaderBlackboard, getSplitStateKey(patriarchId, 'startTime'));
  Blackboard.delete(leaderBlackboard, getSplitStateKey(patriarchId, 'familyIds'));
  Blackboard.delete(leaderBlackboard, getSplitStateKey(patriarchId, 'buildingId'));
}

/**
 * Helper to get the tribe leader's blackboard for coordination
 */
function getLeaderBlackboard(human: HumanEntity, gameState: GameWorldState): BlackboardData | null {
  const leader = getTribeLeaderForCoordination(human, gameState);
  return leader?.aiBlackboard ?? null;
}

/**
 * Creates a behavior that allows a potential family leader to split from their current tribe.
 *
 * This is a strategic multi-step behavior that follows one of two strategies:
 * - Migration: Move away to a safe spot, then split, then build a base. Used when the splitting group is small (<50%).
 * - Concentration: Gather at a key building (storage), split, and take it over. Used when the splitting group is large (>=50%).
 *
 * The process has three phases:
 * 1. Planning: Determine strategy, find target location, store state in leader's blackboard.
 * 2. Gathering: Coordinate family to rally at the target point.
 * 3. Executing: Perform the split and post-split actions (build or takeover).
 *
 * State is stored on the tribe leader's blackboard for coordination.
 *
 * @param depth The depth of the node in the behavior tree.
 * @returns A behavior node.
 */
export function createTribeSplitBehavior(depth: number): BehaviorNode<HumanEntity> {
  // Condition: Check if the split process is already in progress
  const isSplitInProgress = new ConditionNode(
    (human: HumanEntity, context: UpdateContext) => {
      const leaderBlackboard = getLeaderBlackboard(human, context.gameState);
      if (!leaderBlackboard) {
        return [false, 'No leader blackboard'];
      }

      const splitState = getSplitStateFromLeaderBlackboard(leaderBlackboard, human.id);
      if (splitState) {
        return [true, `Phase: ${splitState.phase}, Strategy: ${splitState.strategy}`];
      }
      return [false, 'No split in progress'];
    },
    'Is Split In Progress?',
    depth + 2,
  );

  // Condition: Can this human initiate a tribe split?
  const canInitiateSplit = new ConditionNode(
    (human: HumanEntity, context: UpdateContext) => {
      const { canSplit, progress } = canSplitTribe(human, context.gameState);
      return canSplit ? [true, `Progress: ${((progress ?? 1) * 100).toFixed(0)}%`] : [false, 'Cannot split'];
    },
    'Can Split Tribe?',
    depth + 2,
  );

  // Action: Initialize the split process (Planning phase)
  const initializeSplit = new ActionNode(
    (human: HumanEntity, context: UpdateContext) => {
      const leaderBlackboard = getLeaderBlackboard(human, context.gameState);
      if (!leaderBlackboard) {
        return [NodeStatus.FAILURE, 'No leader blackboard'];
      }

      const splitState = createSplitState(human, context.gameState, context.gameState.time);

      if (!splitState) {
        return [NodeStatus.FAILURE, 'Failed to create split state'];
      }

      // Move to gathering phase
      splitState.phase = TribeSplitPhase.Gathering;

      // Save state to leader's blackboard
      saveSplitStateToLeaderBlackboard(leaderBlackboard, human.id, splitState);

      // Start coordinating family movement
      coordinateFamilyMovement(human, splitState, context.gameState);

      return [
        NodeStatus.SUCCESS,
        `Started split: ${splitState.strategy}, target: (${splitState.gatheringTarget.x.toFixed(0)}, ${splitState.gatheringTarget.y.toFixed(0)})`,
      ];
    },
    'Initialize Split',
    depth + 2,
  );

  // Action: Continue the gathering phase
  const continueGathering = new ActionNode(
    (human: HumanEntity, context: UpdateContext) => {
      const leaderBlackboard = getLeaderBlackboard(human, context.gameState);
      if (!leaderBlackboard) {
        return [NodeStatus.FAILURE, 'No leader blackboard'];
      }

      const splitState = getSplitStateFromLeaderBlackboard(leaderBlackboard, human.id);
      if (!splitState) {
        return [NodeStatus.FAILURE, 'No split state'];
      }

      // Check for timeout
      const elapsedTime = context.gameState.time - splitState.startTime;
      if (elapsedTime > TRIBE_SPLIT_GATHERING_TIMEOUT_HOURS) {
        // Abort the split due to timeout
        clearSplitStateFromLeaderBlackboard(leaderBlackboard, human.id);
        human.target = undefined;
        human.activeAction = 'idle';
        return [NodeStatus.FAILURE, `Gathering timed out after ${elapsedTime.toFixed(0)} hours`];
      }

      // Check if all family members have gathered
      const allGathered = areFamilyMembersGathered(
        splitState.familyMemberIds,
        splitState.gatheringTarget,
        context.gameState,
        TRIBE_SPLIT_GATHERING_ARRIVAL_DISTANCE,
      );

      if (allGathered) {
        // Move to execution phase
        splitState.phase = TribeSplitPhase.Executing;
        saveSplitStateToLeaderBlackboard(leaderBlackboard, human.id, splitState);
        return [NodeStatus.SUCCESS, 'Family gathered, ready to execute'];
      }

      // Keep the patriarch moving toward the target
      const { width: worldWidth, height: worldHeight } = context.gameState.mapDimensions;
      const distanceToTarget = calculateWrappedDistance(
        human.position,
        splitState.gatheringTarget,
        worldWidth,
        worldHeight,
      );

      if (distanceToTarget > TRIBE_SPLIT_GATHERING_ARRIVAL_DISTANCE) {
        human.target = splitState.gatheringTarget;
        human.activeAction = 'moving';
      }

      // Periodically re-coordinate family movement
      coordinateFamilyMovement(human, splitState, context.gameState);

      return [NodeStatus.RUNNING, `Gathering: ${elapsedTime.toFixed(0)}h elapsed, ${distanceToTarget.toFixed(0)}px to target`];
    },
    'Continue Gathering',
    depth + 2,
  );

  // Action: Execute the split (final phase)
  const executeSplit = new ActionNode(
    (human: HumanEntity, context: UpdateContext) => {
      const leaderBlackboard = getLeaderBlackboard(human, context.gameState);
      if (!leaderBlackboard) {
        return [NodeStatus.FAILURE, 'No leader blackboard'];
      }

      const splitState = getSplitStateFromLeaderBlackboard(leaderBlackboard, human.id);
      if (!splitState) {
        return [NodeStatus.FAILURE, 'No split state'];
      }

      // Verify we're in the executing phase
      if (splitState.phase !== TribeSplitPhase.Executing) {
        return [NodeStatus.FAILURE, `Wrong phase: ${splitState.phase}`];
      }

      // Perform the actual tribe split
      performTribeSplit(human, context.gameState);

      // Post-split actions based on strategy
      if (splitState.strategy === TribeSplitStrategy.Concentration && splitState.targetBuildingId) {
        // Take over the target building
        const transferred = transferBuildingOwnership(
          splitState.targetBuildingId,
          human.id, // The patriarch is now the new leader
          context.gameState,
        );

        if (!transferred) {
          // Building may have been destroyed, but split still succeeded
          clearSplitStateFromLeaderBlackboard(leaderBlackboard, human.id);
          return [NodeStatus.SUCCESS, 'Split complete (building takeover failed)'];
        }

        clearSplitStateFromLeaderBlackboard(leaderBlackboard, human.id);
        return [NodeStatus.SUCCESS, `Split complete with building takeover`];
      }

      // Migration strategy: the new tribe will need to build their own base
      // This happens naturally through the building placement behavior
      clearSplitStateFromLeaderBlackboard(leaderBlackboard, human.id);
      return [NodeStatus.SUCCESS, 'Split complete (migration)'];
    },
    'Execute Split',
    depth + 2,
  );

  // Branch for when split is already in progress
  const continueSplitProcess = new Sequence(
    [
      // Check what phase we're in and continue appropriately
      new Selector(
        [
          // If in Gathering phase, continue gathering
          new Sequence(
            [
              new ConditionNode(
                (human: HumanEntity, context: UpdateContext) => {
                  const leaderBlackboard = getLeaderBlackboard(human, context.gameState);
                  if (!leaderBlackboard) return [false, 'No leader blackboard'];
                  const splitState = getSplitStateFromLeaderBlackboard(leaderBlackboard, human.id);
                  return splitState?.phase === TribeSplitPhase.Gathering
                    ? [true, 'In gathering phase']
                    : [false, 'Not in gathering phase'];
                },
                'Is Gathering Phase?',
                depth + 4,
              ),
              continueGathering,
            ],
            'Gathering Phase',
            depth + 3,
          ),
          // If in Executing phase, execute the split
          new Sequence(
            [
              new ConditionNode(
                (human: HumanEntity, context: UpdateContext) => {
                  const leaderBlackboard = getLeaderBlackboard(human, context.gameState);
                  if (!leaderBlackboard) return [false, 'No leader blackboard'];
                  const splitState = getSplitStateFromLeaderBlackboard(leaderBlackboard, human.id);
                  return splitState?.phase === TribeSplitPhase.Executing
                    ? [true, 'In executing phase']
                    : [false, 'Not in executing phase'];
                },
                'Is Executing Phase?',
                depth + 4,
              ),
              executeSplit,
            ],
            'Executing Phase',
            depth + 3,
          ),
        ],
        'Phase Selector',
        depth + 2,
      ),
    ],
    'Continue Split Process',
    depth + 1,
  );

  // Branch for initiating a new split
  const initiateSplitProcess = new Sequence(
    [canInitiateSplit, initializeSplit],
    'Initiate Split Process',
    depth + 1,
  );

  // Main selector: either continue an in-progress split or start a new one
  const tribeSplitAction = new Selector(
    [
      // First, check if there's an in-progress split to continue
      new Sequence([isSplitInProgress, continueSplitProcess], 'Handle In-Progress Split', depth + 1),
      // Otherwise, try to initiate a new split
      initiateSplitProcess,
    ],
    'Tribe Split Action',
    depth,
  );

  // Wrap the entire action in a CooldownNode to rate-limit this behavior.
  // Note: The cooldown only applies when not in the middle of a split process.
  return new CooldownNode(TRIBE_SPLIT_CHECK_INTERVAL_HOURS, tribeSplitAction, 'Tribe Split Cooldown', depth);
}
