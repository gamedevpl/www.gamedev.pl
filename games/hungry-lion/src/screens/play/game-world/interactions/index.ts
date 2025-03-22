import { InteractionDefinition } from './interactions-types';
import { COLLISIONS } from './definitions/collision-interaction';
import { LION_PREY_INTERACTION } from './definitions/lion-prey-interaction';
import { LION_CARRION_INTERACTION } from './definitions/lion-carrion-interaction';
import { HUNTER_LION_INTERACTION } from './definitions/hunter-lion-interaction';

export const interactionsDefinitions = [
  COLLISIONS,
  LION_PREY_INTERACTION,
  LION_CARRION_INTERACTION,
  HUNTER_LION_INTERACTION,
] as InteractionDefinition[];