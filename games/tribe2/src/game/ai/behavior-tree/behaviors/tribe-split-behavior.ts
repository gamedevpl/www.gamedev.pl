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

// Blackboard keys for the tribe split state (stored on patriarch's own blackboard)
// Key format: tribeSplit_{field}
function getSplitStateKey(field: string): string {
  return `tribeSplit_${field}`;
}

/**
 * Helper to get split state from patriarch's own blackboard
 */
function getSplitStateFromBlackboard(blackboard: BlackboardData): TribeSplitState | null {
  const strategy = Blackboard.get<string>(blackboard, getSplitStateKey('strategy'));
  const phase = Blackboard.get<string>(blackboard, getSplitStateKey('phase'));
  const targetX = Blackboard.get<number>(blackboard, getSplitStateKey('targetX'));
  const targetY = Blackboard.get<number>(blackboard, getSplitStateKey('targetY'));
  const startTime = Blackboard.get<number>(blackboard, getSplitStateKey('startTime'));
  const familyIds = Blackboard.get<string>(blackboard, getSplitStateKey('familyIds'));

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

  const targetBuildingId = Blackboard.get<number>(blackboard, getSplitStateKey('buildingId'));

  // Parse family IDs from comma-separated string (handle empty string case)
  const familyMemberIds = familyIds.length > 0
    ? familyIds.split(',').map((id) => parseInt(id, 10)).filter((id) => !isNaN(id))
    : [];

  // If no family members, the state is invalid
  if (familyMemberIds.length === 0) {
    return null;
  }

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
 * Helper to save split state to patriarch's own blackboard
 */
function saveSplitStateToBlackboard(blackboard: BlackboardData, state: TribeSplitState): void {
  Blackboard.set(blackboard, getSplitStateKey('strategy'), state.strategy);
  Blackboard.set(blackboard, getSplitStateKey('phase'), state.phase);
  Blackboard.set(blackboard, getSplitStateKey('targetX'), state.gatheringTarget.x);
  Blackboard.set(blackboard, getSplitStateKey('targetY'), state.gatheringTarget.y);
  Blackboard.set(blackboard, getSplitStateKey('startTime'), state.startTime);
  // Store family IDs as comma-separated string (blackboard supports strings)
  Blackboard.set(blackboard, getSplitStateKey('familyIds'), state.familyMemberIds.join(','));
  if (state.targetBuildingId !== undefined) {
    Blackboard.set(blackboard, getSplitStateKey('buildingId'), state.targetBuildingId);
  }
}

/**
 * Helper to clear split state from patriarch's own blackboard
 */
function clearSplitStateFromBlackboard(blackboard: BlackboardData): void {
  Blackboard.delete(blackboard, getSplitStateKey('strategy'));
  Blackboard.delete(blackboard, getSplitStateKey('phase'));
  Blackboard.delete(blackboard, getSplitStateKey('targetX'));
  Blackboard.delete(blackboard, getSplitStateKey('targetY'));
  Blackboard.delete(blackboard, getSplitStateKey('startTime'));
  Blackboard.delete(blackboard, getSplitStateKey('familyIds'));
  Blackboard.delete(blackboard, getSplitStateKey('buildingId'));
}

/**
 * Creates a behavior that allows a potential family leader to split from their current tribe.
 *
 * This is a strategic multi-step behavior that follows one of two strategies:
 * - Migration: Move away to a safe spot, then split, then build a base. Used when the splitting group is small (<50%).
 * - Concentration: Gather at a key building (storage), split, and take it over. Used when the splitting group is large (>=50%).
 *
 * The process has three phases:
 * 1. Planning: Determine strategy, find target location, store state in patriarch's blackboard.
 * 2. Gathering: Coordinate family to rally at the target point.
 * 3. Executing: Perform the split and post-split actions (build or takeover).
 *
 * State is stored on the patriarch's own blackboard (the human who will lead the new tribe).
 *
 * @param depth The depth of the node in the behavior tree.
 * @returns A behavior node.
 */
export function createTribeSplitBehavior(depth: number): BehaviorNode<HumanEntity> {
  // Condition: Check if the split process is already in progress
  const isSplitInProgress = new ConditionNode(
    (_human: HumanEntity, _context: UpdateContext, blackboard: BlackboardData) => {
      const splitState = getSplitStateFromBlackboard(blackboard);
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
    (human: HumanEntity, context: UpdateContext, blackboard: BlackboardData) => {
      const splitState = createSplitState(human, context.gameState, context.gameState.time);

      if (!splitState) {
        return [NodeStatus.FAILURE, 'Failed to create split state'];
      }

      // Move to gathering phase
      splitState.phase = TribeSplitPhase.Gathering;

      // Save state to patriarch's own blackboard
      saveSplitStateToBlackboard(blackboard, splitState);

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
    (human: HumanEntity, context: UpdateContext, blackboard: BlackboardData) => {
      const splitState = getSplitStateFromBlackboard(blackboard);
      if (!splitState) {
        return [NodeStatus.FAILURE, 'No split state'];
      }

      // Check for timeout
      const elapsedTime = context.gameState.time - splitState.startTime;
      if (elapsedTime > TRIBE_SPLIT_GATHERING_TIMEOUT_HOURS) {
        // Abort the split due to timeout
        clearSplitStateFromBlackboard(blackboard);
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
        saveSplitStateToBlackboard(blackboard, splitState);
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
    (human: HumanEntity, context: UpdateContext, blackboard: BlackboardData) => {
      const splitState = getSplitStateFromBlackboard(blackboard);
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
          clearSplitStateFromBlackboard(blackboard);
          return [NodeStatus.SUCCESS, 'Split complete (building takeover failed)'];
        }

        clearSplitStateFromBlackboard(blackboard);
        return [NodeStatus.SUCCESS, `Split complete with building takeover`];
      }

      // Migration strategy: the new tribe will need to build their own base
      // This happens naturally through the building placement behavior
      clearSplitStateFromBlackboard(blackboard);
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
                (_human: HumanEntity, _context: UpdateContext, blackboard: BlackboardData) => {
                  const splitState = getSplitStateFromBlackboard(blackboard);
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
                (_human: HumanEntity, _context: UpdateContext, blackboard: BlackboardData) => {
                  const splitState = getSplitStateFromBlackboard(blackboard);
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

  // Branch for initiating a new split (wrapped in cooldown to rate-limit checking)
  const initiateSplitProcess = new CooldownNode(
    TRIBE_SPLIT_CHECK_INTERVAL_HOURS,
    new Sequence(
      [canInitiateSplit, initializeSplit],
      'Initiate Split Sequence',
      depth + 2,
    ),
    'Initiate Split Cooldown',
    depth + 1,
  );

  // Main selector: either continue an in-progress split or start a new one
  // The cooldown is only on the initiate branch, not the continue branch
  const tribeSplitAction = new Selector(
    [
      // First, check if there's an in-progress split to continue (no cooldown)
      new Sequence([isSplitInProgress, continueSplitProcess], 'Handle In-Progress Split', depth + 1),
      // Otherwise, try to initiate a new split (with cooldown)
      initiateSplitProcess,
    ],
    'Tribe Split Action',
    depth,
  );

  return tribeSplitAction;
}
