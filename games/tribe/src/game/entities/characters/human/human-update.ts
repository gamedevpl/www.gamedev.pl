import { GAME_DAY_IN_REAL_SECONDS, HOURS_PER_GAME_DAY, HUMAN_HUNGER_INCREASE_PER_HOUR } from '../../../world-consts';
import { HumanEntity } from './human-types';

export function humanUpdate(entity: HumanEntity, deltaTime: number) {
  // Check for hunger increase
  entity.hunger += deltaTime * (HUMAN_HUNGER_INCREASE_PER_HOUR / (HOURS_PER_GAME_DAY / GAME_DAY_IN_REAL_SECONDS));

  // Check for age increase
  entity.age += deltaTime * (1 / ((HOURS_PER_GAME_DAY * 365) / GAME_DAY_IN_REAL_SECONDS));
}
