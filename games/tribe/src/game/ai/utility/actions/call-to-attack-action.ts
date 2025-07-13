import { HumanEntity } from '../../../entities/characters/human/human-types';
import { UpdateContext } from '../../../world-types';
import { Goal, GoalType } from '../goals/goal-types';
import { Action, ActionType } from './action-types';
import { isTribeUnderAttack, getTribeForLeader, findNearbyEnemiesOfTribe } from '../../../utils/world-utils';
import { PLAYER_CALL_TO_ATTACK_DURATION_HOURS, PLAYER_CALL_TO_ATTACK_RADIUS } from '../../../world-consts';
import { addVisualEffect } from '../../../utils/visual-effects-utils';
import { VisualEffectType } from '../../../visual-effects/visual-effect-types';
import { playSoundAt } from '../../../sound/sound-manager';
import { SoundType } from '../../../sound/sound-types';
import { IndexedWorldState } from '../../../world-index/world-index-types';

export const callToAttackAction: Action = {
  type: ActionType.CALL_TO_ATTACK,

  getUtility(human: HumanEntity, context: UpdateContext, goal: Goal): number {
    if (goal.type !== GoalType.DEFEND_TRIBE && goal.type !== GoalType.ELIMINATE_THREATS) {
      return 0;
    }

    // Only leaders can call to attack
    if (human.id !== human.leaderId || human.isCallingToAttack) {
      return 0;
    }

    const indexedState = context.gameState as IndexedWorldState;
    const tribe = getTribeForLeader(human.id, indexedState);

    if (goal.type === GoalType.DEFEND_TRIBE) {
      // High utility if the tribe is currently under attack
      if (isTribeUnderAttack(tribe, indexedState)) {
        return 0.9;
      }
    }

    if (goal.type === GoalType.ELIMINATE_THREATS) {
      // Moderate utility if there are enemies nearby to opportunistically attack
      const enemies = findNearbyEnemiesOfTribe(human.position, human.id, indexedState, PLAYER_CALL_TO_ATTACK_RADIUS);
      if (enemies.length > 0) {
        return 0.6;
      }
    }

    return 0;
  },

  execute(human: HumanEntity, context: UpdateContext): void {
    human.isCallingToAttack = true;
    human.callToAttackEndTime = context.gameState.time + PLAYER_CALL_TO_ATTACK_DURATION_HOURS;

    addVisualEffect(
      context.gameState,
      VisualEffectType.CallToAttack,
      human.position,
      PLAYER_CALL_TO_ATTACK_DURATION_HOURS,
    );
    playSoundAt(context, SoundType.CallToAttack, human.position);

    // The leader stays put and calls, the followers will react based on their own AI
    human.activeAction = 'idle';
    human.targetPosition = undefined;
  },
};
