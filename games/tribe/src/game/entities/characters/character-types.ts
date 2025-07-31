import { Entity } from '../entities-types';
import { AIType } from '../../ai/ai-types';
import { BehaviorNode } from '../../ai/behavior-tree/behavior-tree-types';
import { Blackboard } from '../../ai/behavior-tree/behavior-tree-blackboard';

/**
 * Base interface for character-like entities in the game.
 * This serves as a foundation for more specific character types like humans, prey, and predators.
 */
export interface CharacterEntity extends Entity {
  /** The current age of the character in game years. */
  age: number;
  /** The maximum age the character can reach before dying of old age. */
  maxAge: number;
  /** The current hunger level of the character (0-100). */
  hunger: number;
  /** The type of AI used by this character. */
  aiType?: AIType;
  /** The root node of the behavior tree for this AI. */
  aiBehaviorTree?: BehaviorNode;
  /** The blackboard for the behavior tree AI. */
  aiBlackboard?: Blackboard;
  /** Current active action. Set by player input or AI decision. */
  activeAction?: string;
}
