import { EntityId } from '../../entities-types';
import { FoodItem } from '../../../food/food-types';
import { CharacterEntity } from '../character-types';
import { TribeControl, TribeRole } from '../../tribe/tribe-types';

/**
 * Represents a human entity in the game.
 * Humans are the main characters controlled by the player or AI.
 */
export interface HumanEntity extends CharacterEntity {
  /** Current hitpoints (0-maxHitpoints). Death occurs at 0. */
  hitpoints: number;

  /** Maximum hitpoints. */
  maxHitpoints: number;

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

  /** Pregnancy father (if known). */
  pregnancyFatherId?: EntityId;

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
  activeAction?: HumanAction;

  /** Cooldown time before being able to gather again. */
  gatheringCooldownTime?: number;

  /** Cooldown time before being able to attack again. */
  attackCooldown?: number;
  attackTargetId?: EntityId;

  /** Cooldown for the leader's high-level strategic decision-making. */
  leaderMetaStrategyCooldown?: number;

  /** Target for 'moving' action, either a position or entity. */
  target?: { x: number; y: number } | EntityId; // Target for 'moving' action. Set by player input or AI decision.

  /** The current progress of the entity's animation (0-1). */
  animationProgress?: number;

  /** The speed at which the entity's animation plays. */
  animationSpeed?: number;

  // Visual effect cooldowns
  lastPregnantEffectTime?: number;
  lastPartneredEffectTime?: number;
  lastTargetAcquiredEffectTime?: number;
  lastEatingEffectTime?: number;
  lastChildFedEffectTime?: number;

  /** A temporary slowdown effect, usually after being hit. */
  movementSlowdown?: { modifier: number; endTime: number };

  /** The tribe settings available only for tribe leaders. */
  tribeControl?: TribeControl;

  /** The current role assigned within the tribe, if any. */
  tribeRole?: TribeRole;
}

export type HumanAction =
  | 'gathering' // Collecting resources from berry bushes
  | 'eating' // Consuming food
  | 'moving' // Changing position
  | 'idle' // Not performing any action
  | 'procreating' // Reproducing
  | 'feeding' // Giving food to a child
  | 'attacking' // Engaging in combat
  | 'planting' // Sowing seeds or placing plants
  | 'depositing' // Depositing resources into storage
  | 'retrieving' // Retrieving resources from storage
  | 'takingOverBuilding' // Taking over an enemy building
  | 'destroyingBuilding'; // Destroying an enemy building
