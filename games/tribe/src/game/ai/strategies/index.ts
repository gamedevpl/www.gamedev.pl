import { AttackingStrategy } from './attacking-strategy';
import { EatingStrategy } from './eating-strategy';
import { GatheringStrategy } from './gathering-strategy';
import { IdleWanderStrategy } from './idle-wander-strategy';
import { ProcreationStrategy } from './procreation-strategy';
import { ChildSeekingFoodStrategy } from './child-seeking-food-strategy';
import { ParentFeedingChildStrategy } from './parent-feeding-child-strategy';
import { ParentSeekingFoodForChildStrategy } from './parent-seeking-food-for-child-strategy';
import { HumanAIStrategy } from './ai-strategy-types';
import { PlantingFlagStrategy } from './planting-flag-strategy';
import { FleeingStrategy } from './fleeing-strategy';
import { PlantingStrategy } from './planting-strategy';
import { ReclaimingStrategy } from './reclaiming-strategy';

/**
 * A list of all available human AI strategies, ordered by priority.
 * The AI will iterate through this list and execute the first strategy
 * whose conditions are met.
 */
export const humanAIStrategies: HumanAIStrategy<unknown>[] = [
  new FleeingStrategy(),
  new AttackingStrategy(),
  new EatingStrategy(),
  new ChildSeekingFoodStrategy(),
  new ParentSeekingFoodForChildStrategy(),
  new ParentFeedingChildStrategy(),
  new ReclaimingStrategy(),
  new PlantingFlagStrategy(),
  new GatheringStrategy(),
  new PlantingStrategy(),
  new ProcreationStrategy(),
  new IdleWanderStrategy(), // Fallback, should always be last
];
