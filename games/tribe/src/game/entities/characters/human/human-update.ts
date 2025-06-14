import {
  GAME_DAY_IN_REAL_SECONDS,
  HOURS_PER_GAME_DAY,
  HUMAN_HUNGER_INCREASE_PER_HOUR,
  HUMAN_HUNGER_DEATH,
  CHILD_TO_ADULT_AGE,
  HUMAN_PREGNANCY_HUNGER_INCREASE_RATE_MODIFIER,
  CHILD_HUNGER_INCREASE_RATE_MODIFIER,
  HUMAN_BERRY_HUNGER_REDUCTION,
  HUMAN_OLD_AGE_THRESHOLD,
  HUMAN_OLD_PARENT_HUNGER_THRESHOLD_FOR_FEEDING,
  ADULT_CHILD_FEEDING_RANGE,
  ADULT_CHILD_FEED_PARENT_COOLDOWN_HOURS,
  HUMAN_YEAR_IN_REAL_SECONDS,
  HUNGER_EFFECT_THRESHOLD,
  EFFECT_DURATION_MEDIUM_HOURS,
} from '../../../world-consts';
import { HumanEntity } from './human-types';
import { UpdateContext } from '../../../world-types';
import { createHumanCorpse, removeEntity } from '../../entities-update';
import { giveBirth } from '../../entities-update';
import { calculateWrappedDistance } from '../../../utils/math-utils';
import { findChildren, findHeir } from '../../../utils/world-utils';
import { addVisualEffect } from '../../../utils/visual-effects-utils';
import { VisualEffectType } from '../../../visual-effects/visual-effect-types';

export function humanUpdate(entity: HumanEntity, updateContext: UpdateContext, deltaTime: number) {
  const { gameState } = updateContext;
  const gameHoursDelta = deltaTime * (HOURS_PER_GAME_DAY / GAME_DAY_IN_REAL_SECONDS);

  entity.isAdult = entity.age >= CHILD_TO_ADULT_AGE;
  entity.hunger += deltaTime * (HUMAN_HUNGER_INCREASE_PER_HOUR / (HOURS_PER_GAME_DAY / GAME_DAY_IN_REAL_SECONDS));

  if (
    entity.hunger > HUNGER_EFFECT_THRESHOLD &&
    (!entity.lastHungerEffectTime || gameState.time - entity.lastHungerEffectTime > EFFECT_DURATION_MEDIUM_HOURS * 2)
  ) {
    addVisualEffect(gameState, VisualEffectType.Hunger, entity.position, EFFECT_DURATION_MEDIUM_HOURS, entity.id);
    entity.lastHungerEffectTime = gameState.time;
  }

  entity.age += deltaTime / HUMAN_YEAR_IN_REAL_SECONDS;

  if (entity.gender === 'female' && entity.isPregnant && entity.gestationTime) {
    entity.gestationTime -= gameHoursDelta;
    entity.hunger +=
      deltaTime *
      ((HUMAN_HUNGER_INCREASE_PER_HOUR * HUMAN_PREGNANCY_HUNGER_INCREASE_RATE_MODIFIER -
        HUMAN_HUNGER_INCREASE_PER_HOUR) /
        (HOURS_PER_GAME_DAY / GAME_DAY_IN_REAL_SECONDS));

    if (
      !entity.lastPregnantEffectTime ||
      gameState.time - entity.lastPregnantEffectTime > EFFECT_DURATION_MEDIUM_HOURS * 3
    ) {
      addVisualEffect(gameState, VisualEffectType.Pregnant, entity.position, EFFECT_DURATION_MEDIUM_HOURS, entity.id);
      entity.lastPregnantEffectTime = gameState.time;
    }

    if (entity.gestationTime <= 0) {
      giveBirth(entity, entity.fatherId, updateContext);
      entity.isPregnant = false;
      entity.gestationTime = 0;
      entity.fatherId = undefined;
    }
  }

  if (entity.procreationCooldown) {
    entity.procreationCooldown -= gameHoursDelta;
    if (entity.procreationCooldown < 0) entity.procreationCooldown = 0;
  }

  if (entity.attackCooldown) {
    entity.attackCooldown -= gameHoursDelta;
    if (entity.attackCooldown < 0) entity.attackCooldown = 0;
  }

  if (entity.isStunned && entity.stunnedUntil && entity.stunnedUntil <= gameState.time) {
    entity.isStunned = false;
    entity.stunnedUntil = 0;
    entity.activeAction = 'idle';
  }

  if (entity.feedParentCooldownTime) {
    entity.feedParentCooldownTime -= gameHoursDelta;
    if (entity.feedParentCooldownTime < 0) entity.feedParentCooldownTime = 0;
  }

  if (entity.feedChildCooldownTime) {
    entity.feedChildCooldownTime -= gameHoursDelta;
    if (entity.feedChildCooldownTime < 0) entity.feedChildCooldownTime = 0;
  }

  if (!entity.isAdult) {
    entity.hunger +=
      deltaTime *
      ((HUMAN_HUNGER_INCREASE_PER_HOUR * CHILD_HUNGER_INCREASE_RATE_MODIFIER - HUMAN_HUNGER_INCREASE_PER_HOUR) /
        (HOURS_PER_GAME_DAY / GAME_DAY_IN_REAL_SECONDS));
  }

  if (entity.isAdult && entity.berries > 0 && (!entity.feedParentCooldownTime || entity.feedParentCooldownTime <= 0)) {
    const parentsToFeed = [];
    if (entity.motherId) {
      const mother = gameState.entities.entities.get(entity.motherId) as HumanEntity | undefined;
      if (mother) parentsToFeed.push(mother);
    }
    if (entity.fatherId) {
      const father = gameState.entities.entities.get(entity.fatherId) as HumanEntity | undefined;
      if (father) parentsToFeed.push(father);
    }

    for (const parentEntity of parentsToFeed) {
      if (
        parentEntity.age >= HUMAN_OLD_AGE_THRESHOLD &&
        parentEntity.hunger >= HUMAN_OLD_PARENT_HUNGER_THRESHOLD_FOR_FEEDING
      ) {
        const distance = calculateWrappedDistance(
          entity.position,
          parentEntity.position,
          gameState.mapDimensions.width,
          gameState.mapDimensions.height,
        );
        if (distance <= ADULT_CHILD_FEEDING_RANGE) {
          entity.berries--;
          parentEntity.hunger = Math.max(0, parentEntity.hunger - HUMAN_BERRY_HUNGER_REDUCTION);
          entity.feedParentCooldownTime = ADULT_CHILD_FEED_PARENT_COOLDOWN_HOURS;
          break;
        }
      }
    }
  }

  let causeOfDeath: string | undefined = undefined;
  if (entity.hunger >= HUMAN_HUNGER_DEATH) {
    if (entity.berries > 0 && entity.isAdult) {
      entity.berries--;
      entity.hunger = Math.max(0, entity.hunger - HUMAN_BERRY_HUNGER_REDUCTION);
      entity.eatingCooldownTime = gameState.time + 1;
    } else {
      causeOfDeath = 'hunger';
    }
  } else if (entity.age >= entity.maxAge) {
    causeOfDeath = 'oldAge';
  }

  if (causeOfDeath) {
    if (entity.isPlayer) {
      const oldestOffspring = findHeir(findChildren(gameState, entity));
      if (oldestOffspring) {
        oldestOffspring.isPlayer = true;
        gameState.generationCount++;
      } else {
        gameState.gameOver = true;
        gameState.causeOfGameOver = causeOfDeath;
      }
    }
    createHumanCorpse(gameState.entities, entity.position, entity.gender, entity.age, entity.id, gameState.time);
    removeEntity(gameState.entities, entity.id);
    return;
  }

  if (entity.animationProgress === undefined) {
    entity.animationProgress = 0;
  }
  if (entity.animationSpeed === undefined) {
    entity.animationSpeed = 1;
  }

  entity.animationProgress += deltaTime * entity.animationSpeed;
  if (entity.animationProgress >= 1) {
    entity.animationProgress = 0;
  }
}
