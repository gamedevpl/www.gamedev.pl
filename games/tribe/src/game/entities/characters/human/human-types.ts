import { Entity } from '../../entities-types';

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

  /** Current active action. Set by player input or AI decision. */
  activeAction?: 'gathering' | 'eating' | 'moving' | 'idle'; // Current action: e.g., 'moving', 'eating', 'gathering', 'idle'. Set by player input or AI decision.

  /** Target position for 'moving' action. Set by player input or AI decision. */
  targetPosition?: { x: number; y: number }; // Target position for 'moving' action. Set by player input or AI decision.
}
