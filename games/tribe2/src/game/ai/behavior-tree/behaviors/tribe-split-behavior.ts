import { HumanEntity } from '../../../entities/characters/human/human-types';
import { UpdateContext } from '../../../world-types';
import {
  checkSplitConditions,
  planSplit,
  checkFamilyGathered,
  executeSplit,
  getSplitPhase,
  setSplitPhase,
  setSplitStrategy,
  checkAndHandleTimeout,
  coordinateFamilyGathering,
} from '../../../entities/tribe/tribe-split-utils';
import { BehaviorNode, NodeStatus } from '../behavior-tree-types';
import { ActionNode, ConditionNode, CooldownNode, Sequence, Selector } from '../nodes';
import { TRIBE_SPLIT_CHECK_INTERVAL_HOURS } from '../../../entities/tribe/tribe-consts.ts';

/**
 * Creates a behavior that allows a potential family leader to split from their current tribe
 * using a multi-phase approach with two strategies: Migration and Concentration.
 *
 * The split process follows these phases:
 * 1. Check: Verify split conditions and determine optimal strategy
 * 2. Plan: Identify target location (migration) or building (concentration)
 * 3. Gather: Coordinate family members to gather at the target
 * 4. Execute: Perform the actual tribe split
 *
 * All state is managed via the leader's blackboard to avoid polluting HumanEntity.
 *
 * @param depth The depth of the node in the behavior tree.
 * @returns A behavior node.
 */
export function createTribeSplitBehavior(depth: number): BehaviorNode<HumanEntity> {
  const tribeSplitStateMachine = new Selector(
    [
      // Phase 1: Checking
      new Sequence(
        [
          new ConditionNode(
            (human: HumanEntity, context: UpdateContext) => {
              if (!human.aiBlackboard) return [false, 'No blackboard'];
              
              const currentPhase = getSplitPhase(human.aiBlackboard);
              
              // Check for timeout in any active phase
              if (currentPhase !== 'idle') {
                if (checkAndHandleTimeout(human.aiBlackboard, context.gameState.time)) {
                  return [false, 'Phase timed out, reset to idle'];
                }
              }
              
              return [currentPhase === 'idle', `Phase: ${currentPhase}`];
            },
            'Is Idle?',
            depth + 2,
          ),
          new ActionNode(
            (human: HumanEntity, context: UpdateContext) => {
              if (!human.aiBlackboard) return NodeStatus.FAILURE;

              const result = checkSplitConditions(human, context.gameState);
              
              if (result.canSplit && result.strategy) {
                setSplitPhase(human.aiBlackboard, 'planning', context.gameState.time);
                setSplitStrategy(human.aiBlackboard, result.strategy);
                return NodeStatus.SUCCESS;
              }
              
              return NodeStatus.FAILURE;
            },
            'Check Split Conditions',
            depth + 2,
          ),
        ],
        'Check Phase',
        depth + 1,
      ),

      // Phase 2: Planning
      new Sequence(
        [
          new ConditionNode(
            (human: HumanEntity, _context: UpdateContext) => {
              if (!human.aiBlackboard) return [false, 'No blackboard'];
              const currentPhase = getSplitPhase(human.aiBlackboard);
              return [currentPhase === 'planning', `Phase: ${currentPhase}`];
            },
            'Is Planning?',
            depth + 2,
          ),
          new ActionNode(
            (human: HumanEntity, context: UpdateContext) => {
              if (!human.aiBlackboard) return NodeStatus.FAILURE;

              const success = planSplit(human, context.gameState);
              
              if (success) {
                setSplitPhase(human.aiBlackboard, 'gathering', context.gameState.time);
                return NodeStatus.SUCCESS;
              }
              
              // Planning failed, reset to idle
              setSplitPhase(human.aiBlackboard, 'idle', context.gameState.time);
              return NodeStatus.FAILURE;
            },
            'Plan Split Strategy',
            depth + 2,
          ),
        ],
        'Planning Phase',
        depth + 1,
      ),

      // Phase 3: Gathering
      new Sequence(
        [
          new ConditionNode(
            (human: HumanEntity, _context: UpdateContext) => {
              if (!human.aiBlackboard) return [false, 'No blackboard'];
              const currentPhase = getSplitPhase(human.aiBlackboard);
              return [currentPhase === 'gathering', `Phase: ${currentPhase}`];
            },
            'Is Gathering?',
            depth + 2,
          ),
          new ActionNode(
            (human: HumanEntity, context: UpdateContext) => {
              if (!human.aiBlackboard) return NodeStatus.FAILURE;

              // Actively coordinate family members to move to the gathering point
              coordinateFamilyGathering(human, context.gameState);

              // Check if family has gathered
              const gathered = checkFamilyGathered(human, context.gameState);
              
              if (gathered) {
                setSplitPhase(human.aiBlackboard, 'executing', context.gameState.time);
                return NodeStatus.SUCCESS;
              }
              
              // Still gathering, return RUNNING to keep trying
              return NodeStatus.RUNNING;
            },
            'Wait for Family to Gather',
            depth + 2,
          ),
        ],
        'Gathering Phase',
        depth + 1,
      ),

      // Phase 4: Executing
      new Sequence(
        [
          new ConditionNode(
            (human: HumanEntity, _context: UpdateContext) => {
              if (!human.aiBlackboard) return [false, 'No blackboard'];
              const currentPhase = getSplitPhase(human.aiBlackboard);
              return [currentPhase === 'executing', `Phase: ${currentPhase}`];
            },
            'Is Executing?',
            depth + 2,
          ),
          new ActionNode(
            (human: HumanEntity, context: UpdateContext) => {
              if (!human.aiBlackboard) return NodeStatus.FAILURE;

              const success = executeSplit(human, context.gameState);
              
              if (success) {
                // Split complete, state is reset to idle by executeSplit
                return NodeStatus.SUCCESS;
              }
              
              // Execution failed, reset to idle\n              setSplitPhase(human.aiBlackboard, 'idle', context.gameState.time);
              return NodeStatus.FAILURE;
            },
            'Execute Tribe Split',
            depth + 2,
          ),
        ],
        'Execution Phase',
        depth + 1,
      ),
    ],
    'Tribe Split State Machine',
    depth + 1,
  );

  // Wrap the entire state machine in a CooldownNode to rate-limit this behavior
  return new CooldownNode(
    TRIBE_SPLIT_CHECK_INTERVAL_HOURS,
    tribeSplitStateMachine,
    'Tribe Split Cooldown',
    depth,
  );
}
