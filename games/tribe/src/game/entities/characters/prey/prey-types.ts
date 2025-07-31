import { EntityId } from '../../entities-types';
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

  /** Genetic code for visual appearance and traits. */
  geneCode: number;

  /** Current active action. Set by AI decision. */
  activeAction?: PreyAction;

  /** Target for 'moving' action, either a position or entity. */
  target?: { x: number; y: number } | EntityId;

  /** The current progress of the entity's animation (0-1). */
  animationProgress?: number;

  /** The speed at which the entity's animation plays. */
  animationSpeed?: number;

  /** A temporary slowdown effect, usually after being hit. */
  movementSlowdown?: { modifier: number; endTime: number };

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