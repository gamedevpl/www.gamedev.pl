import { HumanEntity } from '../../../entities/characters/human/human-types';
import { UpdateContext } from '../../../world-types';
import { ActionNode, CachingNode, ConditionNode, CooldownNode, Sequence } from '../nodes';
import { BehaviorNode, NodeStatus } from '../behavior-tree-types';
import { findOptimalMigrationTarget } from '../../../utils';
import { AI_MIGRATION_CHECK_INTERVAL_HOURS, BT_EXPENSIVE_OPERATION_CACHE_HOURS } from '../../../ai-consts.ts';
import { PLAYER_CALL_TO_FOLLOW_DURATION_HOURS } from '../../../tribe-consts.ts';
import { Blackboard } from '../behavior-tree-blackboard.ts';

const MIGRATION_CHECK_COOLDOWN_KEY = 'tribeMigrationCheckCooldown';

/**
 * Creates a high-level strategic behavior for an AI leader to decide if the tribe should migrate to a new, better location.
 * This is an expensive check, so it's wrapped in a CachingNode.
 */
export function createTribeMigrationBehavior(depth: number): BehaviorNode<HumanEntity> {
  const sequence = new Sequence(
    [
      // 1. Condition: Is this human a leader of a tribe?
      new ConditionNode(
        (human: HumanEntity) => !!human.leaderId && human.leaderId === human.id,
        'Is Tribe Leader',
        depth + 2,
      ),

      // 2. Condition: Has enough time passed since the last migration check?
      new ConditionNode(
        (human: HumanEntity, context: UpdateContext) => {
          const lastCheckTime = Blackboard.get(human.aiBlackboard, MIGRATION_CHECK_COOLDOWN_KEY) as number | undefined;
          if (!lastCheckTime) {
            return true; // First time checking
          }
          return context.gameState.time - lastCheckTime >= AI_MIGRATION_CHECK_INTERVAL_HOURS;
        },
        'Is Migration Check Cooldown Over',
        depth + 2,
      ),

      // 3. Action: Find a new habitat and initiate migration if a better one is found.
      new ActionNode(
        (human: HumanEntity, context: UpdateContext) => {
          // Update the cooldown time first, so we don't check again immediately if we fail.
          if (human.aiBlackboard) {
            Blackboard.set(human.aiBlackboard, MIGRATION_CHECK_COOLDOWN_KEY, context.gameState.time);
          }

          const migrationTarget = findOptimalMigrationTarget(human, context.gameState);

          if (migrationTarget) {
            // A better spot was found! Initiate the move.
            human.isCallingToFollow = true;
            human.callToFollowEndTime = context.gameState.time + PLAYER_CALL_TO_FOLLOW_DURATION_HOURS;
            human.target = migrationTarget;
            human.activeAction = 'moving';

            // TODO: Add a visual effect and sound for the leader's call

            return NodeStatus.SUCCESS; // We've successfully started the migration
          }

          return NodeStatus.FAILURE; // No better place to go, for now.
        },
        'Execute Tribe Migration',
        depth + 2,
      ),
    ],
    'Tribe Migration Strategy',
    depth + 1,
  );

  const cached = new CachingNode(sequence, BT_EXPENSIVE_OPERATION_CACHE_HOURS, 'Cache Tribe Migration', depth + 1);
  return new CooldownNode(AI_MIGRATION_CHECK_INTERVAL_HOURS, cached, 'Tribe Migration Cooldown', depth);
}
