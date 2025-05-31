import {
  GAME_DAY_IN_REAL_SECONDS,
  HOURS_PER_GAME_DAY,
  HUMAN_HUNGER_INCREASE_PER_HOUR,
  HUMAN_HUNGER_DEATH,
} from '../../../world-consts';
import { HumanEntity } from './human-types';
import { UpdateContext } from '../../../world-types';
import { removeEntity } from '../../entities-update';

export function humanUpdate(entity: HumanEntity, updateContext: UpdateContext, deltaTime: number) {
  // Check for hunger increase
  entity.hunger += deltaTime * (HUMAN_HUNGER_INCREASE_PER_HOUR / (HOURS_PER_GAME_DAY / GAME_DAY_IN_REAL_SECONDS));

  // Check for age increase
  entity.age += deltaTime * (1 / ((HOURS_PER_GAME_DAY * 365) / GAME_DAY_IN_REAL_SECONDS));

  // Check for death conditions
  let causeOfDeath: string | undefined = undefined;
  if (entity.hunger >= HUMAN_HUNGER_DEATH) {
    causeOfDeath = 'hunger';
  } else if (entity.age >= entity.maxAge) {
    causeOfDeath = 'oldAge';
  }

  if (causeOfDeath) {
    if (entity.isPlayer) {
      updateContext.gameState.gameOver = true;
      updateContext.gameState.causeOfGameOver = causeOfDeath;
    }
    removeEntity(updateContext.gameState.entities, entity.id);
    // No further updates for this entity as it's being removed
    return;
  }
}
