import { InteractionDefinition } from './interactions-types';
import { humanProcreationInteraction } from './human-procreation-interaction'; // Added import
import { humanChildFeedingInteraction } from './human-child-feeding-interaction'; // New import
import { humanAttackInteraction } from './human-attack-interaction';
import { humanCollisionInteraction } from './collision-interaction';
import { humanGatherFoodInteractions } from './human-gather-food-interaction';

export const interactionsDefinitions: InteractionDefinition[] = [
  humanCollisionInteraction,
  ...humanGatherFoodInteractions,
  humanProcreationInteraction, // Added procreation interaction
  humanChildFeedingInteraction, // Added child feeding interaction
  humanAttackInteraction,
  // TODO: Add other interaction definitions here (imported from dedicated files)
] as InteractionDefinition[];
