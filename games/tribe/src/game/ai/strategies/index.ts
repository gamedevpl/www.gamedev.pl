import { AttackingStrategy } from './attacking-strategy';
import { DefendingClaimedBushStrategy } from './defending-claimed-bush-strategy';
import { EatingStrategy } from './eating-strategy';
import { FleeingStrategy } from './fleeing-strategy';
import { GatheringStrategy } from './gathering-strategy';
import { IdleWanderStrategy } from './idle-wander-strategy';
import { PlantingStrategy } from './planting-strategy';
import { ProcreationStrategy } from './procreation-strategy';
import { ChildSeekingFoodStrategy } from './child-seeking-food-strategy';
import { ParentFeedingChildStrategy } from './parent-feeding-child-strategy';
import { ParentSeekingFoodForChildStrategy } from './parent-seeking-food-for-child-strategy';
import { HumanAIStrategy } from './ai-strategy-types';

/**
 * A list of all available human AI strategies, ordered by priority.
 * The AI will iterate through this list and execute the first strategy
 * whose conditions are met.
 */
export const humanAIStrategies: HumanAIStrategy<unknown>[] = [
  new FleeingStrategy(),
  new AttackingStrategy(),
  new DefendingClaimedBushStrategy(),
  new EatingStrategy(),
  new ChildSeekingFoodStrategy(),
  new ParentSeekingFoodForChildStrategy(),
  new ParentFeedingChildStrategy(),
  new ProcreationStrategy(),
  new GatheringStrategy(),
  new PlantingStrategy(),
  new IdleWanderStrategy(), // Fallback, should always be last
];
