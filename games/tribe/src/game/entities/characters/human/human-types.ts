import { Entity } from '../../entities-types';
import { EntityId } from '../../entities-types';
import { FoodItem } from '../../../food/food-types';
import { AIType } from '../../../ai/ai-types';
import { BehaviorNode } from '../../../ai/behavior-tree/behavior-tree-types';
import { Blackboard } from '../../../ai/behavior-tree/behavior-tree-blackboard';

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
  activeAction?: HumanAction;

  /** Flag indicating if the human is currently issuing a call to attack. */
  isCallingToAttack?: boolean;
  /** Game time when the call to attack command ends. */
  callToAttackEndTime?: number;

  /** Flag indicating if the human is currently issuing a call to follow. */
  isCallingToFollow?: boolean;
  /** Game time when the call to follow command ends. */
  callToFollowEndTime?: number;

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
  lastHungerEffectTime?: number;
  lastPregnantEffectTime?: number;
  lastPartneredEffectTime?: number;
  lastTargetAcquiredEffectTime?: number;
  lastEatingEffectTime?: number;
  lastChildFedEffectTime?: number;

  /** A temporary slowdown effect, usually after being hit. */
  movementSlowdown?: { modifier: number; endTime: number };

  /** The type of AI used by this human. */
  aiType?: AIType;

  /** The root node of the behavior tree for this AI. */
  aiBehaviorTree?: BehaviorNode;

  /** The blackboard for the behavior tree AI. */
  aiBlackboard?: Blackboard;
}

export type HumanAction =
  | 'gathering'
  | 'eating'
  | 'moving'
  | 'idle'
  | 'procreating'
  | 'attacking'
  | 'planting'
  | 'callingToAttack'
  | 'tribeSplitting'
  | 'following';
