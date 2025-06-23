import { State } from '../../../../state-machine/state-machine-types';
import {
  EFFECT_DURATION_MEDIUM_HOURS,
  HUMAN_SEIZE_BUILDUP_HOURS,
  HUMAN_SEIZE_COOLDOWN_HOURS,
  KARMA_ON_SEIZE,
  SEIZE_PERIMETER_RADIUS,
} from '../../../../world-consts';
import { HumanEntity } from '../human-types';
import { HUMAN_IDLE, HUMAN_SEIZING, HumanSeizingStateData } from './human-state-types';
import { applyKarma } from '../../../../karma/karma-utils';
import { addVisualEffect } from '../../../../utils/visual-effects-utils';
import { VisualEffectType } from '../../../../visual-effects/visual-effect-types';
import { playSoundAt } from '../../../../sound/sound-manager';
import { SoundType } from '../../../../sound/sound-types';

export const humanSeizingState: State<HumanEntity, HumanSeizingStateData> = {
  id: HUMAN_SEIZING,
  onEnter: (context) => {
    addVisualEffect(
      context.updateContext.gameState,
      VisualEffectType.SeizeBuildup,
      context.entity.position,
      HUMAN_SEIZE_BUILDUP_HOURS,
      context.entity.id,
    );
    return {
      enteredAt: context.updateContext.gameState.time,
      state: 'seizing',
    };
  },
  update: (data, context) => {
    const { entity, updateContext } = context;
    const { gameState } = updateContext;
    const timeInState = gameState.time - data.enteredAt;

    if (timeInState >= HUMAN_SEIZE_BUILDUP_HOURS) {
      playSoundAt(context.updateContext, SoundType.Seize, entity.position);
      addVisualEffect(
        context.updateContext.gameState,
        VisualEffectType.Seize,
        context.entity.position,
        EFFECT_DURATION_MEDIUM_HOURS,
        entity.id,
      );

      const targets: HumanEntity[] = [];
      for (const otherEntity of gameState.entities.entities.values()) {
        if (otherEntity.type === 'human' && otherEntity.id !== entity.id) {
          const otherHuman = otherEntity as HumanEntity;
          // Target anyone not in the leader's tribe
          if (otherHuman.leaderId !== entity.leaderId) {
            const distance = Math.sqrt(
              (entity.position.x - otherHuman.position.x) ** 2 + (entity.position.y - otherHuman.position.y) ** 2,
            );
            if (distance <= SEIZE_PERIMETER_RADIUS) {
              targets.push(otherHuman);
            }
          }
        }
      }

      // The leader (entity) applies karma to all targets
      for (const target of targets) {
        applyKarma(entity, target, KARMA_ON_SEIZE, gameState);
      }

      entity.seizeCooldown = HUMAN_SEIZE_COOLDOWN_HOURS;
      entity.activeAction = 'idle';
      return { nextState: HUMAN_IDLE, data: { ...data } };
    }

    return { nextState: HUMAN_SEIZING, data };
  },
};
