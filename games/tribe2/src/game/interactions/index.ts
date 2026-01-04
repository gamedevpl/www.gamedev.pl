import { InteractionDefinition } from './interactions-types';
import { humanProcreationInteraction } from './human-procreation-interaction'; // Added import
import { humanChildFeedingInteraction } from './human-child-feeding-interaction'; // New import
import { humanAttackInteraction } from './human-attack-interaction';
import {
  humanCollisionInteraction,
  humanTreeCollisionInteraction,
  preyTreeCollisionInteraction,
  predatorTreeCollisionInteraction,
} from './collision-interaction';
import { humanGatherFoodInteractions } from './human-gather-food-interaction';
import { preyEatBerryBushInteraction } from './prey-eat-berry-bush-interaction';
import { predatorHuntPreyInteraction } from './predator-hunt-prey-interaction';
import { humanHuntPreyInteraction } from './human-hunt-prey-interaction';
import { predatorAttackHumanInteraction } from './predator-attack-human-interaction';
import { humanAttackPredatorInteraction } from './human-attack-predator-interaction';
import { preyProcreationInteraction } from './prey-procreation-interaction';
import { predatorProcreationInteraction } from './predator-procreation-interaction';
import { preyChildFeedingInteraction } from './prey-child-feeding-interaction';
import { predatorChildFeedingInteraction } from './predator-child-feeding-interaction';
import { predatorEatCorpseInteraction } from './predator-eat-corpse-interaction';
import { predatorAttackRivalInteraction } from './predator-attack-rival-interaction';
import { storageDepositInteraction } from './storage-deposit-interaction';
import { storageRetrieveInteraction } from './storage-retrieve-interaction';
import { storageStealInteraction } from './storage-steal-interaction';
import { buildingTakeoverInteraction } from './building-takeover-interaction';
import { buildingRemovalInteraction } from './building-removal-interaction';
import { humanTreeChopInteraction } from './human-chop-tree-interaction';

export const interactionsDefinitions: InteractionDefinition[] = [
  humanCollisionInteraction,
  humanTreeCollisionInteraction,
  preyTreeCollisionInteraction,
  predatorTreeCollisionInteraction,
  ...humanGatherFoodInteractions,
  humanProcreationInteraction, // Added procreation interaction
  humanChildFeedingInteraction, // Added child feeding interaction
  humanAttackInteraction,
  storageDepositInteraction, // Storage interactions
  storageRetrieveInteraction,
  storageStealInteraction,
  buildingTakeoverInteraction,
  buildingRemovalInteraction,
  humanTreeChopInteraction,
  // Animal interactions
  preyEatBerryBushInteraction,
  preyChildFeedingInteraction, // Prey parent-child feeding
  predatorChildFeedingInteraction, // Predator parent-child feeding
  predatorEatCorpseInteraction, // Predators can eat from any corpse
  predatorHuntPreyInteraction,
  humanHuntPreyInteraction,
  humanAttackPredatorInteraction, // Humans can defend against predators
  predatorAttackHumanInteraction,
  predatorAttackRivalInteraction,
  preyProcreationInteraction,
  predatorProcreationInteraction,
] as InteractionDefinition[];
