import { EntityId } from '../../entities-types';
import { AIType } from '../../../ai/ai-types';
import { BehaviorNode } from '../../../ai/behavior-tree/behavior-tree-types';
import { Blackboard } from '../../../ai/behavior-tree/behavior-tree-blackboard';
import { CharacterEntity } from '../character-types';

/**
 * Represents a predator entity in the game.
 * Predators hunt prey and can fight with humans.
 */
export interface PredatorEntity extends CharacterEntity {
  /** Current hitpoints (0-maxHitpoints). Death occurs at 0. */
  hitpoints: number;

  /** Maximum hitpoints. */
  maxHitpoints: number;

  /** Gender of the predator. */
  gender: 'male' | 'female';

  /** Whether the predator is an adult (can procreate). */
  isAdult?: boolean;

  /** Whether the predator (female) is pregnant. */
  isPregnant?: boolean;

  /** Remaining gestation time in game hours (for pregnant females). */
  gestationTime?: number;

  /** Cooldown time before being able to procreate again. */
  procreationCooldown?: number;

  /** ID of the predator's father, if known. */
  fatherId?: EntityId;

  /** ID of the predator's mother, if known. */
  motherId?: EntityId;

  /** IDs of the predator's ancestors. */
  ancestorIds: EntityId[];

  /** The current progress of the entity's animation (0-1). */
  animationProgress?: number;

  /** The speed at which the entity's animation plays. */
  animationSpeed?: number;

  /** A temporary slowdown effect, usually after being hit. */
  movementSlowdown?: { modifier: number; endTime: number };

  /** The type of AI used by this predator. */
  aiType?: AIType;

  /** The root node of the behavior tree for this AI. */
  aiBehaviorTree?: BehaviorNode;

  /** The blackboard for the behavior tree AI. */
  aiBlackboard?: Blackboard;

  /** Cooldown time before being able to attack again. */
  attackCooldown?: number;

  /** Current attack target */
  attackTargetId?: EntityId;

  /** Cooldown time before being able to hunt again. */
  huntCooldown?: number;

  /** Current hunt target */
  huntTargetId?: EntityId;
}

export type PredatorAction =
  | 'hunting' // Hunting prey
  | 'attacking' // Fighting with humans
  | 'moving' // Changing position
  | 'idle' // Not performing any action
  | 'procreating' // Reproducing
  | 'eating'; // Consuming caught prey