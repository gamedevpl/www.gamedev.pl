import { EntityId } from '../../entities-types';
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

  /** Genetic code for visual appearance and traits. */
  geneCode: number;

  /** Current active action. Set by AI decision. */
  activeAction?: PredatorAction;

  /** Target for 'moving' action, either a position or entity. */
  target?: { x: number; y: number } | EntityId;

  /** The current progress of the entity's animation (0-1). */
  animationProgress?: number;

  /** The speed at which the entity's animation plays. */
  animationSpeed?: number;

  /** A temporary slowdown effect, usually after being hit. */
  movementSlowdown?: { modifier: number; endTime: number };

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