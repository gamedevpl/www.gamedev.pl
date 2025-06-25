import { InteractionDefinition } from './interactions-types';
import { humanProcreationInteraction } from './human-procreation-interaction'; // Added import
import { humanChildFeedingInteraction } from './human-child-feeding-interaction'; // New import
import { humanAttackInteraction } from './human-attack-interaction';
import { humanCollisionInteraction } from './collision-interaction';
import { humanGatherFoodInteractions } from './human-gather-food-interaction';
import { humanAttackFlagInteraction } from './human-attack-flag-interaction';
import { flagReclaimInteraction } from './flag-reclaim-interaction';

export const interactionsDefinitions: InteractionDefinition[] = [
  humanCollisionInteraction,
  ...humanGatherFoodInteractions,
  humanProcreationInteraction, // Added procreation interaction
  humanChildFeedingInteraction, // Added child feeding interaction
  humanAttackInteraction,
  humanAttackFlagInteraction,
  flagReclaimInteraction,
  // TODO: Add other interaction definitions here (imported from dedicated files)
] as InteractionDefinition[];
