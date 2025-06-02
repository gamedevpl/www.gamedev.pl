import { InteractionDefinition } from './interactions-types';
import { humanBerryBushGatherInteraction } from './human-berry-bush-gather-interaction'; // Added import
import { humanProcreationInteraction } from './human-procreation-interaction'; // Added import

export const interactionsDefinitions: InteractionDefinition[] = [
  humanBerryBushGatherInteraction, // Added interaction
  humanProcreationInteraction, // Added procreation interaction
  // TODO: Add other interaction definitions here (imported from dedicated files)
] as InteractionDefinition[];