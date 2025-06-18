import { InteractionDefinition } from './interactions-types';
import { humanBerryBushGatherInteraction } from './human-berry-bush-gather-interaction'; // Added import
import { humanProcreationInteraction } from './human-procreation-interaction'; // Added import
import { humanChildFeedingInteraction } from './human-child-feeding-interaction'; // New import
import { humanAttackInteraction } from "./human-attack-interaction";
import { humanCollisionInteraction } from "./collision-interaction";

export const interactionsDefinitions: InteractionDefinition[] = [
  humanCollisionInteraction,
  humanBerryBushGatherInteraction, // Added interaction
  humanProcreationInteraction, // Added procreation interaction
  humanChildFeedingInteraction, // Added child feeding interaction
  humanAttackInteraction,
  // TODO: Add other interaction definitions here (imported from dedicated files)
] as InteractionDefinition[];
