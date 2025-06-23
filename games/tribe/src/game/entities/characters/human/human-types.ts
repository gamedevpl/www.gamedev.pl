import { Entity } from '../../entities-types';
import { EntityId } from '../../entities-types';
import { FoodItem } from '../../../food/food-types';
import { Karma } from '../../../karma/karma-types';

/**
 * Represents a human entity in the game.
 * Humans are the main characters controlled by the player or AI.
 */
export interface HumanEntity extends Entity {
  /** Current hunger level (0-100). Death occurs at 100. */
  hunger: number;

  /** Current hitpoints (0-maxHitpoints). Death occurs at 0. */
  hitpoints: number;

  /** Maximum hitpoints. */
  maxHitpoints: number;

  /** Current age in game years. */
  age: number;

  /** Maximum age in game years. */
  maxAge: number;

  /** Gender of the human. */
  gender: 'male' | 'female';

  /** Whether this human is controlled by the player. */
  isPlayer?: boolean;

  /** Number of food units the human is carrying. */
  food: FoodItem[];

  /** Maximum number of food units the human can carry. */
  maxFood: number;

  /** Whether the human is an adult (can procreate). */
  isAdult?: boolean;

  /** Whether the human (female) is pregnant. */
  isPregnant?: boolean;

  /** Remaining gestation time in game hours (for pregnant females). */
  gestationTime?: number;

  /** Cooldown time before being able to procreate again. */
  procreationCooldown?: number;

  /** ID of the human's father, if known. */
  fatherId?: EntityId;

  /** ID of the human's mother, if known. */
  motherId?: EntityId;

  /** IDs of the human's partners. */
  partnerIds?: EntityId[];

  /** IDs of the human's ancestors. */
  ancestorIds: EntityId[];

  /** ID of the human's tribe leader. If it's the same as the human's ID, they are the leader. */
  leaderId?: EntityId;

  /** Visual representation of the tribe badge. */
  tribeBadge?: string;

  /** Cooldown time for a parent to feed a child. */
  feedChildCooldownTime?: number;

  /** Cooldown time for feeding a parent. */
  feedParentCooldownTime?: number;

  /** Current active action. Set by player input or AI decision. */
  activeAction?: 'gathering' | 'eating' | 'moving' | 'idle' | 'procreating' | 'seekingFood' | 'attacking' | 'seizing';

  /** Cooldown time before being able to gather again. */
  gatheringCooldownTime?: number;

  /** Cooldown time before being able to attack again. */
  attackCooldown?: number;
  attackTargetId?: EntityId;

  /** Cooldown time before being able to seize again. */
  seizeCooldown?: number;

  /** Target position for 'moving' action. Set by player input or AI decision. */
  targetPosition?: { x: number; y: number }; // Target position for 'moving' action. Set by player input or AI decision.

  /** The current progress of the entity's animation (0-1). */
  animationProgress?: number;

  /** The speed at which the entity's animation plays. */
  animationSpeed?: number;

  // Visual effect cooldowns
  lastHungerEffectTime?: number;
  lastPregnantEffectTime?: number;
  lastPartneredEffectTime?: number;
  lastTargetAcquiredEffectTime?: number;
  lastEatingEffectTime?: number;
  lastChildFedEffectTime?: number;

  /** Karma relationships with other humans. */
  karma: Karma;
}
