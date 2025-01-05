import { LION_MOVE_TO_TARGET } from './definitions/lion-movement-behavior';
import { PREY_MOVEMENT } from './definitions/prey-movement-behavior';
import { PREY_FLEEING } from './definitions/prey-fleeing-behavior';
import { PREY_DRINKING } from './definitions/prey-drink-behavior';
import { PREY_EATING } from './definitions/prey-eat-behavior';

export const agenticDefinitions = [
  PREY_FLEEING,
  PREY_DRINKING,
  PREY_EATING,
  PREY_MOVEMENT,
  LION_MOVE_TO_TARGET,
  // TODO: Lion: move
  // TODO: Lion: chase
  // TODO: Lion: kill
  // TODO: Lion: eat
];
