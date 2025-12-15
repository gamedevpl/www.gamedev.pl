import { State, StateContext } from '../../../../state-machine/state-machine-types';
import { calculateWrappedDistance, getDirectionVectorOnTorus, vectorNormalize } from '../../../../utils/math-utils';
import { HUMAN_ATTACK_RANGE } from '../../../../human-consts';
import { HumanEntity } from '../human-types';
import { getEffectiveSpeed } from '../human-utils';
import { HUMAN_ATTACKING, HumanAttackingStateData, HUMAN_IDLE } from './human-state-types';
import { ARROW_RANGE, ARROW_BUILDUP_TIME_HOURS, ARROW_COOLDOWN_HOURS } from '../../../arrow/arrow-consts';
import { createArrow } from '../../../arrow/arrow-utils';
import { addVisualEffect } from '../../../../utils/visual-effects-utils';
import { VisualEffectType } from '../../../../visual-effects/visual-effect-types';
import { EFFECT_DURATION_SHORT_HOURS } from '../../../../effect-consts';
import { HOURS_PER_GAME_DAY, GAME_DAY_IN_REAL_SECONDS } from '../../../../game-consts';
import { Entity } from '../../../entities-types';

export const humanAttackingState: State<HumanEntity, HumanAttackingStateData> = {
  id: HUMAN_ATTACKING,
  onEnter: (context, nextData) => {
    return {
      ...nextData,
      enteredAt: context.updateContext.gameState.time,
      attackStartTime: context.updateContext.gameState.time,
    };
  },
  update: (data, context) => {
    const { entity, updateContext } = context;
    const { gameState, deltaTime } = updateContext;
    const gameHoursDelta = deltaTime * (HOURS_PER_GAME_DAY / GAME_DAY_IN_REAL_SECONDS);

    if (entity.activeAction !== 'attacking' || !entity.attackTargetId) {
      entity.activeAction = 'idle';
      resetArrowState(entity);
      return { nextState: HUMAN_IDLE, data: { ...data } };
    }

    const targetEntity = gameState.entities.entities[entity.attackTargetId];
    if (!targetEntity) {
      entity.activeAction = 'idle';
      resetArrowState(entity);
      return { nextState: HUMAN_IDLE, data: { ...data } };
    }

    const distanceToTarget = calculateWrappedDistance(
      entity.position,
      targetEntity.position,
      gameState.mapDimensions.width,
      gameState.mapDimensions.height,
    );

    const dirToTarget = getDirectionVectorOnTorus(
      entity.position,
      targetEntity.position,
      gameState.mapDimensions.width,
      gameState.mapDimensions.height,
    );
    entity.direction = vectorNormalize(dirToTarget);

    // Decrement arrow cooldown
    if (entity.arrowShootingCooldown !== undefined && entity.arrowShootingCooldown > 0) {
      entity.arrowShootingCooldown -= gameHoursDelta;
    }

    // Distance-based attack decision
    if (distanceToTarget > ARROW_RANGE) {
      // Too far - chase the target
      entity.acceleration = getEffectiveSpeed(entity);
      resetArrowState(entity);
    } else if (distanceToTarget > HUMAN_ATTACK_RANGE) {
      // In arrow range (HUMAN_ATTACK_RANGE to ARROW_RANGE) - use ranged attack
      entity.acceleration = 0; // Stop moving while aiming

      // Check if on arrow cooldown
      if (entity.arrowShootingCooldown !== undefined && entity.arrowShootingCooldown > 0) {
        // On cooldown - chase closer for melee
        entity.acceleration = getEffectiveSpeed(entity);
      } else {
        handleArrowAiming(entity, targetEntity, context);
      }
    } else {
      // In melee range (< HUMAN_ATTACK_RANGE) - melee handled by interaction system
      entity.acceleration = 0;
      resetArrowState(entity);
    }

    return { nextState: HUMAN_ATTACKING, data };
  },
};

function resetArrowState(entity: HumanEntity): void {
  entity.isAimingArrow = false;
  entity.arrowBuildupStartTime = undefined;
}

function handleArrowAiming(
  entity: HumanEntity,
  targetEntity: Entity,
  context: StateContext<HumanEntity>,
): void {
  const { gameState } = context.updateContext;

  if (entity.isAimingArrow) {
    // Check if buildup is complete
    if (
      entity.arrowBuildupStartTime !== undefined &&
      entity.arrowBuildupStartTime + ARROW_BUILDUP_TIME_HOURS <= gameState.time
    ) {
      // Fire the arrow!
      createArrow(
        gameState.entities,
        entity.position,
        targetEntity.position,
        targetEntity.velocity,
        gameState.mapDimensions,
        entity.id,
        targetEntity.id,
      );

      // Set cooldown and reset aiming state
      entity.arrowShootingCooldown = ARROW_COOLDOWN_HOURS;
      entity.isAimingArrow = false;
      entity.arrowBuildupStartTime = undefined;

      // Add arrow release visual effect
      addVisualEffect(
        gameState,
        VisualEffectType.ArrowRelease,
        entity.position,
        EFFECT_DURATION_SHORT_HOURS,
        entity.id,
      );
    }
    // Still building up - continue aiming (do nothing, state persists)
  } else {
    // Start aiming
    entity.isAimingArrow = true;
    entity.arrowBuildupStartTime = gameState.time;

    // Add arrow aiming visual effect
    addVisualEffect(
      gameState,
      VisualEffectType.ArrowAiming,
      entity.position,
      ARROW_BUILDUP_TIME_HOURS,
      entity.id,
    );
  }
}
