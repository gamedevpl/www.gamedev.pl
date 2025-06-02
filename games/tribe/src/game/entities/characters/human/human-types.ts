import { Entity } from '../../entities-types';
import { EntityId } from '../../entities-types';

/**
 * Represents a human entity in the game.
 * Humans are the main characters controlled by the player or AI.
 */
export interface HumanEntity extends Entity {
  /** Current hunger level (0-100). Death occurs at 100. */
  hunger: number;

  /** Current age in game years. */
  age: number;

  /** Maximum age in game years. */
  maxAge: number;

  /** Gender of the human. */
  gender: 'male' | 'female';

  /** Whether this human is controlled by the player. */
  isPlayer?: boolean;

  /** Number of berries the human is carrying. */
  berries: number;

  /** Maximum number of berries the human can carry. */
  maxBerries: number;

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

  /** Current active action. Set by player input or AI decision. */
  activeAction?: 'gathering' | 'eating' | 'moving' | 'idle' | 'procreating'; // Current action: e.g., 'moving', 'eating', 'gathering', 'idle', 'procreating'. Set by player input or AI decision.

  /** Target position for 'moving' action. Set by player input or AI decision. */
  targetPosition?: { x: number; y: number }; // Target position for 'moving' action. Set by player input or AI decision.
}
