import { InteractionDefinition } from './interactions-types';
import { humanBerryBushGatherInteraction } from './human-berry-bush-gather-interaction'; // Added import

export const interactionsDefinitions: InteractionDefinition[] = [
  humanBerryBushGatherInteraction, // Added interaction
  // TODO: Add other interaction definitions here (imported from dedicated files)
] as InteractionDefinition[];
