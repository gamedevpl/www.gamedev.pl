import {
  LEADER_BT_CALL_TO_ATTACK_COOLDOWN_HOURS,
  PLAYER_CALL_TO_ATTACK_DURATION_HOURS,
  PLAYER_CALL_TO_ATTACK_RADIUS,
} from '../../../world-consts';
import { HumanEntity } from '../../../entities/characters/human/human-types';
import { UpdateContext } from '../../../world-types';
import { findNearbyEnemiesOfTribe } from '../../../utils/world-utils';
import { BehaviorNode, NodeStatus } from '../behavior-tree-types';
import { ActionNode, ConditionNode, Sequence } from '../nodes';
import { IndexedWorldState } from '../../../world-index/world-index-types';
import { addVisualEffect } from '../../../utils/visual-effects-utils';
import { VisualEffectType } from '../../../visual-effects/visual-effect-types';
import { playSoundAt } from '../../../sound/sound-manager';
import { SoundType } from '../../../sound/sound-types';

const ENEMIES_NEARBY_KEY = 'enemiesNearby';

/**
 * Creates a behavior that allows a tribe leader to issue a "call to attack".
 * The behavior is a sequence that checks several conditions before executing.
 */
export function createLeaderCallToAttackBehavior(depth: number): BehaviorNode {
  const isLeader = new ConditionNode((human) => human.id === human.leaderId, 'Is Leader?', depth + 1);

  const isNotAlreadyCalling = new ConditionNode(
    (human) => !human.isCallingToAttack,
    'Is Not Already Calling?',
    depth + 1,
  );

  const isCooldownReady = new ConditionNode(
    (human) => (human.leaderCallToAttackCooldown ?? 0) <= 0,
    'Is Cooldown Ready?',
    depth + 1,
  );

  const checkEnemiesNearby = new ActionNode(
    (human, context, blackboard) => {
      const enemies = findNearbyEnemiesOfTribe(
        human.position,
        human.id,
        context.gameState as IndexedWorldState,
        PLAYER_CALL_TO_ATTACK_RADIUS,
      );
      if (enemies.length > 0) {
        blackboard.set(ENEMIES_NEARBY_KEY, enemies);
        return NodeStatus.SUCCESS;
      }
      return NodeStatus.FAILURE;
    },
    'Check Enemies Nearby',
    depth + 1,
  );

  const issueCallToAction = new ActionNode(
    (human: HumanEntity, context: UpdateContext) => {
      human.isCallingToAttack = true;
      human.callToAttackEndTime = context.gameState.time + PLAYER_CALL_TO_ATTACK_DURATION_HOURS;
      human.leaderCallToAttackCooldown = LEADER_BT_CALL_TO_ATTACK_COOLDOWN_HOURS;

      addVisualEffect(
        context.gameState,
        VisualEffectType.CallToAttack,
        human.position,
        PLAYER_CALL_TO_ATTACK_DURATION_HOURS,
      );
      playSoundAt(context, SoundType.CallToAttack, human.position);

      // Leader stops to issue the call
      human.activeAction = 'idle';
      human.targetPosition = undefined;

      return NodeStatus.SUCCESS;
    },
    'Issue Call to Attack',
    depth + 1,
  );

  return new Sequence(
    [isLeader, isNotAlreadyCalling, isCooldownReady, checkEnemiesNearby, issueCallToAction],
    'Leader Call to Attack',
    depth,
  );
}
