import { EntityId } from '../../entities-types';
import { AIType } from '../../../ai/ai-types';
import { BehaviorNode } from '../../../ai/behavior-tree/behavior-tree-types';
import { Blackboard } from '../../../ai/behavior-tree/behavior-tree-blackboard';
import { CharacterEntity } from '../character-types';

/**
 * Represents a prey entity in the game.
 * Prey are creatures that can be hunted by predators and humans.
 */
export interface PreyEntity extends CharacterEntity {
  /** Current hitpoints (0-maxHitpoints). Death occurs at 0. */
  hitpoints: number;

  /** Maximum hitpoints. */
  maxHitpoints: number;

  /** Gender of the prey. */
  gender: 'male' | 'female';

  /** Whether the prey is an adult (can procreate). */
  isAdult?: boolean;

  /** Whether the prey (female) is pregnant. */
  isPregnant?: boolean;

  /** Remaining gestation time in game hours (for pregnant females). */
  gestationTime?: number;

  /** Cooldown time before being able to procreate again. */
  procreationCooldown?: number;

  /** ID of the prey's father, if known. */
  fatherId?: EntityId;

  /** ID of the prey's mother, if known. */
  motherId?: EntityId;

  /** IDs of the prey's ancestors. */
  ancestorIds: EntityId[];

  /** The current progress of the entity's animation (0-1). */
  animationProgress?: number;

  /** The speed at which the entity's animation plays. */
  animationSpeed?: number;

  /** A temporary slowdown effect, usually after being hit. */
  movementSlowdown?: { modifier: number; endTime: number };

  /** The type of AI used by this prey. */
  aiType?: AIType;

  /** The root node of the behavior tree for this AI. */
  aiBehaviorTree?: BehaviorNode;

  /** The blackboard for the behavior tree AI. */
  aiBlackboard?: Blackboard;

  /** Cooldown time before being able to eat again. */
  eatingCooldownTime?: number;

  /** Cooldown time before being able to flee again. */
  fleeCooldown?: number;

  /** Current target to flee from */
  fleeTargetId?: EntityId;
}

export type PreyAction =
  | 'grazing' // Eating berry bushes
  | 'moving' // Changing position
  | 'idle' // Not performing any action
  | 'procreating' // Reproducing
  | 'fleeing'; // Running away from predators/humans