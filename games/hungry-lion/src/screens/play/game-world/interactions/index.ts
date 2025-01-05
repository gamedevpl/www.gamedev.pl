import { InteractionDefinition } from './interactions-types';
import { COLLISIONS } from './definitions/collision-interaction';
import { LION_PREY_INTERACTION } from './definitions/lion-prey-interaction';

export const interactionsDefinitions: InteractionDefinition[] = [
  COLLISIONS,
  LION_PREY_INTERACTION,
  // TODO: Lion to Prey: kill
  // TODO: Lion to Carrion: eat
];
